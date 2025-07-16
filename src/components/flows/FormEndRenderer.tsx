import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ArrowRight, CheckCircle2, FileText, Send, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { RobustDocumentDownload } from './RobustDocumentDownload';

interface FormEndRendererProps {
  step: any;
  onComplete: (response: any) => void;
  isLoading?: boolean;
}

export const FormEndRenderer: React.FC<FormEndRendererProps> = ({
  step,
  onComplete,
  isLoading = false
}) => {
  const { toast } = useToast();
  const [whatsappStatus, setWhatsappStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');

  // Auto-trigger para FormEnd
  useEffect(() => {
    handleFormEndWhatsApp();
  }, []);

  const handleFormEndWhatsApp = async () => {
    console.log('🏁 FormEnd: Enviando materiais WhatsApp automaticamente');
    setWhatsappStatus('sending');
    
    try {
      // Buscar executionId da URL
      const executionId = window.location.pathname.split('/').pop();
      
      if (!executionId) {
        console.error('❌ FormEnd: ExecutionId não encontrado');
        setWhatsappStatus('error');
        return;
      }

      // Buscar dados da execução
      const { data: execution } = await supabase
        .from('flow_executions')
        .select('patient_id')
        .eq('id', executionId)
        .single();

      if (!execution) {
        console.error('❌ FormEnd: Execução não encontrada');
        setWhatsappStatus('error');
        return;
      }

      // Normalizar arquivos se existirem
      const arquivosNormalizados = (step.arquivos || []).map((arquivo: any) => {
        let cleanUrl = arquivo.file_url || arquivo.url || arquivo.publicUrl || '';
        
        // Corrigir URLs duplicadas
        if (cleanUrl.includes('https://') && cleanUrl.indexOf('https://') !== cleanUrl.lastIndexOf('https://')) {
          const parts = cleanUrl.split('https://');
          cleanUrl = 'https://' + parts[parts.length - 1];
        }
        
        // Forçar uso apenas do bucket clinic-materials
        if (cleanUrl.includes('/flow-documents/')) {
          cleanUrl = cleanUrl.replace('/flow-documents/', '/clinic-materials/');
        }
        
        return {
          id: arquivo.id || arquivo.document_id,
          nome: arquivo.original_filename || arquivo.filename || arquivo.nome || 'Arquivo',
          url: cleanUrl,
          tipo: arquivo.file_type || arquivo.tipo || 'application/octet-stream',
          tamanho: arquivo.file_size || arquivo.tamanho || 0,
          original_filename: arquivo.original_filename || arquivo.filename || arquivo.nome,
          file_url: cleanUrl,
          file_type: arquivo.file_type || arquivo.tipo,
          file_size: arquivo.file_size || arquivo.tamanho
        };
      });

      // Enviar materiais se houver arquivos
      if (arquivosNormalizados.length > 0) {
        const { data: response, error } = await supabase.functions.invoke('send-whatsapp', {
          body: {
            patientId: execution.patient_id,
            executionId: executionId,
            files: arquivosNormalizados
          }
        });

        if (error) {
          console.error('❌ FormEnd: Erro ao enviar WhatsApp:', error);
          setWhatsappStatus('error');
          toast({
            title: "Erro no WhatsApp",
            description: "Não foi possível enviar os materiais",
            variant: "destructive",
          });
        } else {
          console.log('✅ FormEnd: WhatsApp enviado com sucesso:', response);
          setWhatsappStatus('sent');
          toast({
            title: "Materiais Enviados!",
            description: "Arquivos foram enviados por WhatsApp",
          });
        }
      } else {
        console.log('📝 FormEnd: Nenhum arquivo para enviar');
        setWhatsappStatus('sent');
      }
      
    } catch (error) {
      console.error('❌ FormEnd: Erro crítico:', error);
      setWhatsappStatus('error');
      toast({
        title: "Erro",
        description: "Falha ao enviar materiais WhatsApp",
        variant: "destructive",
      });
    }
  };

  const handleComplete = () => {
    console.log('🔄 FormEnd: handleComplete chamado');

    const responseData = {
      nodeId: step.nodeId,
      nodeType: 'formEnd',
      formCompleted: true,
      whatsappStatus,
      timestamp: new Date().toISOString()
    };

    console.log('✅ FormEnd: Enviando responseData:', responseData);
    onComplete(responseData);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-teal-50 to-cyan-50 dark:bg-[#0E0E0E] flex items-center justify-center p-6">
      <Card className="w-full max-w-md bg-white/95 dark:bg-[#0E0E0E]/95 backdrop-blur-sm border-0 shadow-xl animate-fade-in">
        <CardContent className="p-8 text-center">
          <div className="w-20 h-20 bg-gradient-to-r from-emerald-500 to-teal-600 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 className="h-10 w-10 text-white" />
          </div>
          
          <h3 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-4">
            📋 Formulário Concluído!
          </h3>
          
          <p className="text-lg text-gray-600 dark:text-gray-400 mb-6">
            {step.title || 'Etapa finalizada com sucesso'}
          </p>

          {step.mensagemFinal && (
            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 mb-6">
              <p className="text-gray-700 dark:text-gray-300 text-sm">
                {step.mensagemFinal}
              </p>
            </div>
          )}

          {/* Arquivos disponíveis para download */}
          {step.arquivos && step.arquivos.length > 0 && (
            <div className="mb-6">
              <h4 className="text-lg font-semibold text-emerald-700 dark:text-emerald-300 mb-3 flex items-center justify-center">
                <FileText className="h-5 w-5 mr-2" />
                Materiais
              </h4>
              
              {whatsappStatus === 'sending' && (
                <div className="flex items-center justify-center text-blue-700 dark:text-blue-400 mb-4">
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  <span className="text-sm">Enviando materiais por WhatsApp...</span>
                </div>
              )}
              
              {whatsappStatus === 'sent' && (
                <div className="flex items-center justify-center text-emerald-700 dark:text-emerald-300 mb-4">
                  <Send className="h-4 w-4 mr-2" />
                  <span className="text-sm font-medium">✅ Materiais enviados por WhatsApp!</span>
                </div>
              )}
              
              {whatsappStatus === 'error' && (
                <p className="text-sm text-red-600 dark:text-red-400 mb-4">
                  ❌ Erro ao enviar materiais
                </p>
              )}

              <div className="space-y-3">
                {step.arquivos.map((arquivo: any, index: number) => (
                  <RobustDocumentDownload
                    key={index}
                    fileName={arquivo.original_filename || arquivo.filename || arquivo.nome || 'Arquivo'}
                    fileUrl={arquivo.file_url || arquivo.url || arquivo.publicUrl}
                    title={arquivo.original_filename || arquivo.nome || 'Material'}
                    description={`Arquivo enviado via WhatsApp (${((arquivo.file_size || arquivo.tamanho || 0) / 1024).toFixed(1)}KB)`}
                    fileType={arquivo.file_type?.includes('pdf') ? 'pdf' : 'image'}
                    documentId={arquivo.id || arquivo.document_id}
                  />
                ))}
              </div>
            </div>
          )}

          <div className="bg-emerald-500/10 dark:bg-emerald-500/20 rounded-lg p-4 mb-6">
            <p className="text-emerald-700 dark:text-emerald-300 font-medium">
              🎉 Parabéns! Você concluiu este formulário com sucesso.
            </p>
          </div>

          <Button
            onClick={handleComplete}
            disabled={isLoading || whatsappStatus === 'sending'}
            className="w-full bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white py-3 rounded-xl font-medium"
            size="lg"
          >
            {isLoading ? 'Finalizando...' : 'Continuar para Próxima Etapa'}
            <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
          
          <p className="text-sm text-gray-500 dark:text-gray-500 mt-4">
            ✅ Formulário finalizado. Este não é o fim do tratamento.
          </p>
        </CardContent>
      </Card>
    </div>
  );
};