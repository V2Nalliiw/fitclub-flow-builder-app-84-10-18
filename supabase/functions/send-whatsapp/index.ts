import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('🚀 send-whatsapp function called');
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { patientId, executionId, files } = await req.json();
    console.log('📨 Request data:', { patientId, executionId, filesCount: files?.length });

    if (!patientId || !executionId || !files || files.length === 0) {
      console.error('❌ Missing required parameters');
      return new Response(
        JSON.stringify({ error: 'Missing required parameters' }),
        { 
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // Get patient and WhatsApp settings
    const { data: profile } = await supabase
      .from('profiles')
      .select('name, phone, clinic_id')
      .eq('user_id', patientId)
      .single();

    if (!profile?.phone) {
      console.error('❌ Patient phone not found');
      return new Response(
        JSON.stringify({ error: 'Patient phone not found' }),
        { 
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    const { data: whatsappSettings } = await supabase
      .from('whatsapp_settings')
      .select('*')
      .eq('clinic_id', profile.clinic_id)
      .eq('is_active', true)
      .single();

    if (!whatsappSettings) {
      console.error('❌ WhatsApp settings not found');
      return new Response(
        JSON.stringify({ error: 'WhatsApp settings not configured' }),
        { 
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // Create content access token
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30); // 30 days expiry

    const { data: contentAccess, error: contentError } = await supabase
      .from('content_access')
      .insert({
        execution_id: executionId,
        patient_id: patientId,
        files: files,
        expires_at: expiresAt.toISOString()
      })
      .select()
      .single();

    if (contentError || !contentAccess) {
      console.error('❌ Error creating content access:', contentError);
      return new Response(
        JSON.stringify({ error: 'Failed to create content access' }),
        { 
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    console.log('✅ Content access created:', contentAccess.id);

    // Generate download link
    const downloadLink = `${supabaseUrl}/functions/v1/serve-content?token=${contentAccess.access_token}`;
    
    // Try to send using official template first, fallback to simple message
    let whatsappResponse;
    let templateSuccess = false;
    
    if (whatsappSettings.provider === 'meta') {
      console.log('🔄 Tentando template oficial formulario_concluido...');
      
      // Try official template first
      try {
        const templateUrl = `https://graph.facebook.com/v17.0/${whatsappSettings.phone_number}/messages`;
        
        whatsappResponse = await fetch(templateUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${whatsappSettings.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            to: profile.phone,
            type: 'template',
            template: {
              name: 'formulario_concluido',
              language: { code: 'pt_BR' },
              components: [
                {
                  type: 'body',
                  parameters: [
                    { type: 'text', text: profile.name },
                    { type: 'text', text: downloadLink }
                  ]
                }
              ]
            }
          }),
        });

        if (whatsappResponse.ok) {
          templateSuccess = true;
          console.log('✅ Template oficial enviado com sucesso');
        } else {
          console.log('❌ Template oficial falhou, tentando mensagem simples...');
        }
      } catch (templateError) {
        console.log('❌ Erro no template oficial:', templateError);
      }

      // Fallback to simple message if template failed
      if (!templateSuccess) {
        const simpleMessage = `🎉 *Formulário Concluído!*\n\nOlá ${profile.name}! Seus materiais estão prontos para download.\n\n📁 Acesse aqui: ${downloadLink}\n\n📅 Válido até: ${new Date(expiresAt).toLocaleDateString('pt-BR')}\n\nQualquer dúvida, entre em contato conosco! 😊`;
        
        whatsappResponse = await fetch(`https://graph.facebook.com/v17.0/${whatsappSettings.phone_number}/messages`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${whatsappSettings.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            to: profile.phone,
            type: 'text',
            text: { body: simpleMessage }
          }),
        });
      }
    } else if (whatsappSettings.provider === 'evolution') {
      const simpleMessage = `🎉 *Formulário Concluído!*\n\nOlá ${profile.name}! Seus materiais estão prontos para download.\n\n📁 Acesse aqui: ${downloadLink}\n\n📅 Válido até: ${new Date(expiresAt).toLocaleDateString('pt-BR')}\n\nQualquer dúvida, entre em contato conosco! 😊`;
      
      const evolutionUrl = `${whatsappSettings.base_url}/message/sendText/${whatsappSettings.session_name}`;
      
      whatsappResponse = await fetch(evolutionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': whatsappSettings.api_key || '',
        },
        body: JSON.stringify({
          number: profile.phone,
          text: simpleMessage
        }),
      });
    } else {
      console.error('❌ Unsupported WhatsApp provider:', whatsappSettings.provider);
      return new Response(
        JSON.stringify({ error: 'Unsupported WhatsApp provider' }),
        { 
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    if (!whatsappResponse.ok) {
      const errorText = await whatsappResponse.text();
      console.error('❌ WhatsApp API error:', errorText);
      return new Response(
        JSON.stringify({ error: 'Failed to send WhatsApp message', details: errorText }),
        { 
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    const whatsappResult = await whatsappResponse.json();
    console.log('✅ WhatsApp message sent successfully:', whatsappResult);

    return new Response(
      JSON.stringify({ 
        success: true,
        accessId: contentAccess.id,
        downloadLink,
        whatsappResult
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error) {
    console.error('❌ Error in send-whatsapp function:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});