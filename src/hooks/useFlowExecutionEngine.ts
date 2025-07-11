import { useState, useCallback, useEffect } from 'react';
import { FlowNode } from '@/types/flow';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useNotifications } from '@/hooks/useNotifications';
import { useWhatsApp } from '@/hooks/useWhatsApp';
import { useContentUrlGenerator } from '@/hooks/useContentUrlGenerator';
import { useWhatsAppValidations } from '@/hooks/useWhatsAppValidations';
import { useWhatsAppSettings } from '@/hooks/useWhatsAppSettings';
import { usePatientWhatsApp } from '@/hooks/usePatientWhatsApp';

interface ExecutionStep {
  nodeId: string;
  nodeType: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  result?: any;
  error?: string;
  scheduledFor?: string;
}

export const useFlowExecutionEngine = () => {
  const { toast } = useToast();
  const { createNotification } = useNotifications();
  const { sendWhatsAppTemplateMessage, sendMessage } = useWhatsApp();
  const { generateContentUrl } = useContentUrlGenerator();
  const { validateWhatsAppSending, recordOptInActivity } = useWhatsAppValidations();
  const { sendFormToPatient } = usePatientWhatsApp();
  const [processing, setProcessing] = useState(false);
  
  // Aguardar configurações do WhatsApp estarem prontas
  const { loading: whatsappLoading, getWhatsAppConfig } = useWhatsAppSettings();
  const [isWhatsAppReady, setIsWhatsAppReady] = useState(false);
  
  // Verificar se WhatsApp está pronto para uso
  useEffect(() => {
    const checkWhatsAppReady = () => {
      if (!whatsappLoading) {
        const config = getWhatsAppConfig();
        const ready = !!config && config.is_active;
        console.log('🔧 FlowEngine: WhatsApp ready status:', { 
          loading: whatsappLoading, 
          config: !!config, 
          active: config?.is_active, 
          ready 
        });
        setIsWhatsAppReady(ready);
        
        // Se não estiver pronto, tentar novamente em 2 segundos
        if (!ready && !whatsappLoading) {
          setTimeout(checkWhatsAppReady, 2000);
        }
      }
    };
    
    checkWhatsAppReady();
  }, [whatsappLoading, getWhatsAppConfig]);

  const executeFlowStep = useCallback(async (
    executionId: string,
    step: ExecutionStep,
    nodeData: any
  ) => {
    console.log(`🔄 FlowEngine: Executando etapa ${step.nodeType}:`, { executionId, step, nodeData });

    try {
      switch (step.nodeType) {
        case 'start':
          await processStartNode(executionId, step, nodeData);
          break;

        case 'formStart':
          await processFormStartNode(executionId, step, nodeData);
          break;

        case 'formEnd':
          await processFormEndNode(executionId, step, nodeData);
          break;

        case 'delay':
          await processDelayNode(executionId, step, nodeData);
          break;

        case 'question':
          await processQuestionNode(executionId, step, nodeData);
          break;

        case 'whatsapp':
          await processWhatsAppNode(executionId, step, nodeData);
          break;

        case 'end':
          await processEndNode(executionId, step, nodeData);
          break;

        default:
          throw new Error(`Tipo de nó não suportado: ${step.nodeType}`);
      }

      console.log(`✅ FlowEngine: Etapa ${step.nodeType} executada com sucesso`);
      return { success: true };
    } catch (error) {
      console.error(`❌ FlowEngine: Erro ao executar etapa ${step.nodeType}:`, error);
      await handleStepError(executionId, step, error as Error);
      return { success: false, error: (error as Error).message };
    }
  }, []);

  const processStartNode = async (executionId: string, step: ExecutionStep, nodeData: any) => {
    await supabase
      .from('flow_executions')
      .update({
        status: 'em-andamento',
        started_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', executionId);

    console.log('Nó de início processado');
  };

  const processFormStartNode = async (executionId: string, step: ExecutionStep, nodeData: any) => {
    console.log('📝 FlowEngine: Processando FormStart node', { executionId, nodeData });
    
    // Update execution status to active and set progress
    await supabase
      .from('flow_executions')
      .update({
        status: 'in-progress',
        progress: 0,
        updated_at: new Date().toISOString(),
      })
      .eq('id', executionId);

    // Buscar dados da execução para obter o patient_id
    const { data: execution } = await supabase
      .from('flow_executions')
      .select('patient_id')
      .eq('id', executionId)
      .single();

    if (execution) {
      console.log('📞 FlowEngine: Enviando formulário via WhatsApp para paciente', { 
        patientId: (execution as any).patient_id,
        formName: nodeData.titulo || 'Formulário'
      });

      try {
        // Buscar dados do paciente diretamente
        const { data: patient } = await supabase
          .from('profiles')
          .select('name, phone')
          .eq('user_id', (execution as any).patient_id)
          .single();

        if (patient && (patient as any).phone) {
          console.log('📞 FlowEngine: Enviando link do painel via WhatsApp', { 
            patientId: (execution as any).patient_id,
            phone: (patient as any).phone,
            formName: nodeData.titulo || 'Formulário'
          });

          // Enviar link do painel principal diretamente
          const patientDashboardUrl = `${window.location.origin}/`;
          const customMessage = `📋 *${nodeData.titulo || 'Formulário'}*\n\nOlá ${(patient as any).name}! Você tem um novo formulário para preencher.\n\n🔗 Acesse aqui: ${patientDashboardUrl}\n\n_O formulário aparecerá automaticamente quando você abrir o link._`;
          
          // Simplificar validação - enviar imediatamente
          console.log('🚀 FlowEngine: Enviando link do painel via WhatsApp imediatamente...');
          
          // Implementar retry robusto com múltiplas tentativas
          const sendWithRetry = async (attempts = 5) => {
            for (let i = 0; i < attempts; i++) {
              try {
                console.log(`📱 FlowEngine: Enviando via WhatsApp (tentativa ${i + 1}/${attempts})...`);
                const result = await sendMessage((patient as any).phone, customMessage);
                
                console.log('📱 FlowEngine: Resultado do envio:', result);
                
                if (result.success) {
                  await recordOptInActivity(
                    (execution as any).patient_id,
                    (patient as any).phone,
                    'whatsapp_sent'
                  );
                  console.log('✅ FlowEngine: Link do painel enviado com sucesso via WhatsApp');
                  return true;
                } else {
                  console.error(`❌ FlowEngine: Falha no envio (tentativa ${i + 1}):`, result.error);
                  if (i < attempts - 1) {
                    await new Promise(resolve => setTimeout(resolve, (i + 1) * 1000)); // Delay progressivo mais rápido
                  }
                }
              } catch (error) {
                console.error(`❌ FlowEngine: Erro no envio (tentativa ${i + 1}):`, error);
                if (i < attempts - 1) {
                  await new Promise(resolve => setTimeout(resolve, (i + 1) * 1000));
                }
              }
            }
            console.error('❌ FlowEngine: Falha após todas as tentativas de envio');
            return false;
          };
          
          // Executar envio sem await para não bloquear
          sendWithRetry();
        } else {
          console.warn('⚠️ FlowEngine: Paciente sem telefone configurado');
        }
      } catch (error) {
        console.error('❌ FlowEngine: Erro ao enviar link do painel via WhatsApp:', error);
      }
    } else {
      console.error('❌ FlowEngine: Execução não encontrada');
    }

    console.log('📝 FlowEngine: FormStart processado');
  };

  const processFormEndNode = async (executionId: string, step: ExecutionStep, nodeData: any) => {
    console.log('🏁 FlowEngine: Processando FormEnd node', { executionId, nodeData });
    
    // Buscar dados da execução e do paciente
    const { data: execution } = await supabase
      .from('flow_executions')
      .select('patient_id')
      .eq('id', executionId)
      .single();

    if (execution) {
      const { data: patient } = await supabase
        .from('profiles')
        .select('name, phone')
        .eq('user_id', (execution as any).patient_id)
        .single();

      if (patient && (patient as any).phone) {
        console.log('📞 FlowEngine: Enviando WhatsApp de conclusão para paciente', { 
          patientId: (execution as any).patient_id,
          phone: (patient as any).phone,
          template: 'formulario_concluido'
        });

        // Forçar geração de URL de conteúdo com fallback robusto
        let contentUrl = '';
        
        if (nodeData.arquivos && nodeData.arquivos.length > 0) {
          console.log('📁 FlowEngine: Gerando URL para arquivos:', nodeData.arquivos.length);
          
          try {
            contentUrl = await generateContentUrl({
              executionId,
              files: nodeData.arquivos
            }) || '';
            
            if (!contentUrl) {
              console.warn('⚠️ FlowEngine: generateContentUrl retornou vazio, criando URL manual');
              // Fallback: criar entrada manual na tabela content_access
              const accessToken = crypto.randomUUID();
              const expiresAt = new Date();
              expiresAt.setDate(expiresAt.getDate() + 30);
              
              await supabase.from('content_access').insert({
                execution_id: executionId,
                patient_id: (execution as any).patient_id,
                access_token: accessToken,
                files: nodeData.arquivos,
                expires_at: expiresAt.toISOString(),
                metadata: {
                  patient_name: (patient as any).name || 'Paciente',
                  form_name: 'Formulário'
                }
              });
              
              contentUrl = `${window.location.origin}/conteudo-formulario/${executionId}?token=${accessToken}`;
              console.log('🔗 FlowEngine: URL de fallback criada:', contentUrl);
            }
          } catch (error) {
            console.error('❌ FlowEngine: Erro ao gerar URL de conteúdo:', error);
            contentUrl = `${window.location.origin}/conteudo-formulario/${executionId}`;
          }
        } else {
          contentUrl = `${window.location.origin}/conteudo-formulario/${executionId}`;
        }

        console.log('🔗 FlowEngine: URL de conteúdo final:', contentUrl);

        // Validar antes de enviar
        const validation = await validateWhatsAppSending(
          (patient as any).phone,
          'formulario_concluido',
          (execution as any).patient_id
        );

        console.log('✅ FlowEngine: Resultado da validação WhatsApp:', validation);

        // Verificar se template existe antes de enviar
        const { data: templateExists } = await supabase
          .from('whatsapp_templates')
          .select('id, is_active, is_official')
          .eq('name', 'formulario_concluido')
          .eq('is_active', true)
          .single();

        if (!templateExists) {
          console.warn('⚠️ FlowEngine: Template formulario_concluido não encontrado ou inativo');
          // Enviar mensagem simples como fallback
          const fallbackMessage = `🎉 *Formulário Concluído!*\n\nOlá ${(patient as any).name}! Você concluiu o formulário com sucesso.\n\n📁 Acesse seus documentos aqui: ${contentUrl}`;
          
          const sendWithRetryFallback = async (attempts = 3) => {
            for (let i = 0; i < attempts; i++) {
              try {
                const result = await sendMessage((patient as any).phone, fallbackMessage);
                if (result.success) {
                  await recordOptInActivity(
                    (execution as any).patient_id,
                    (patient as any).phone,
                    'whatsapp_sent'
                  );
                  console.log('✅ FlowEngine: Mensagem de conclusão enviada via fallback');
                  return;
                }
                if (i < attempts - 1) await new Promise(resolve => setTimeout(resolve, (i + 1) * 2000));
              } catch (error) {
                if (i < attempts - 1) await new Promise(resolve => setTimeout(resolve, (i + 1) * 2000));
              }
            }
          };
          
          sendWithRetryFallback();
          return;
        }

        // Simplificar envio - tentar template primeiro, fallback para mensagem simples
        const sendCompletionMessage = async (attempts = 5) => {
          for (let i = 0; i < attempts; i++) {
            try {
              console.log(`🚀 FlowEngine: Enviando mensagem de conclusão (tentativa ${i + 1}/${attempts})...`);
              
              let result;
              if (templateExists) {
                result = await sendWhatsAppTemplateMessage(
                  (patient as any).phone,
                  'formulario_concluido',
                  {
                    patient_name: (patient as any).name || 'Paciente',
                    content_url: contentUrl
                  }
                );
              } else {
                // Fallback para mensagem simples
                const fallbackMessage = `🎉 *Formulário Concluído!*\n\nOlá ${(patient as any).name}! Você concluiu o formulário com sucesso.\n\n📁 Acesse seus documentos aqui: ${contentUrl}`;
                result = await sendMessage((patient as any).phone, fallbackMessage);
              }
              
              console.log('📱 FlowEngine: Resultado do envio:', result);
              
              if (result.success) {
                await recordOptInActivity(
                  (execution as any).patient_id,
                  (patient as any).phone,
                  'whatsapp_sent'
                );
                console.log('✅ FlowEngine: Mensagem de conclusão enviada com sucesso');
                return true;
              } else {
                console.error(`❌ FlowEngine: Falha no envio (tentativa ${i + 1}):`, result.error);
                if (i < attempts - 1) {
                  await new Promise(resolve => setTimeout(resolve, (i + 1) * 1000));
                }
              }
            } catch (error) {
              console.error(`❌ FlowEngine: Erro no envio (tentativa ${i + 1}):`, error);
              if (i < attempts - 1) {
                await new Promise(resolve => setTimeout(resolve, (i + 1) * 1000));
              }
            }
          }
          console.error('❌ FlowEngine: Falha após todas as tentativas de envio');
          return false;
        };
        
        // Executar envio sem await para não bloquear
        sendCompletionMessage();
      } else {
        console.warn('⚠️ FlowEngine: Paciente sem telefone configurado');
      }
    } else {
      console.error('❌ FlowEngine: Execução não encontrada');
    }

    console.log('🏁 FlowEngine: Fim de formulário processado');
  };

  const processDelayNode = async (executionId: string, step: ExecutionStep, nodeData: any) => {
    const delay = nodeData.quantidade || 1;
    const tipo = nodeData.tipoIntervalo || 'dias';
    
    let nextExecutionDate = new Date();
    switch (tipo) {
      case 'minutos':
        nextExecutionDate.setMinutes(nextExecutionDate.getMinutes() + delay);
        break;
      case 'horas':
        nextExecutionDate.setHours(nextExecutionDate.getHours() + delay);
        break;
      case 'dias':
      default:
        nextExecutionDate.setDate(nextExecutionDate.getDate() + delay);
        break;
    }

    await supabase
      .from('flow_executions')
      .update({
        status: 'aguardando',
        next_step_available_at: nextExecutionDate.toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', executionId);

    console.log('Delay programado para:', nextExecutionDate);
  };

  const processQuestionNode = async (executionId: string, step: ExecutionStep, nodeData: any) => {
    // Store question info in execution metadata
    await supabase
      .from('flow_executions')
      .update({
        current_step: {
          nodeId: step.nodeId,
          nodeType: step.nodeType,
          title: nodeData.pergunta || 'Pergunta',
          description: 'Responda a pergunta para continuar',
          status: 'disponivel'
        },
        updated_at: new Date().toISOString(),
      })
      .eq('id', executionId);

    console.log('Pergunta criada');
  };

  const processWhatsAppNode = async (executionId: string, step: ExecutionStep, nodeData: any) => {
    // Buscar dados da execução para obter informações do paciente
    const { data: execution } = await supabase
      .from('flow_executions')
      .select('patient_id')
      .eq('id', executionId)
      .single();

    if (!execution) {
      throw new Error('Execução não encontrada');
    }

    // Buscar dados do paciente
    const { data: patient } = await supabase
      .from('profiles')
      .select('name, email')
      .eq('user_id', (execution as any).patient_id)
      .single();

    // Store WhatsApp message info in execution metadata
    await supabase
      .from('flow_executions')
      .update({
        current_step: {
          nodeId: step.nodeId,
          nodeType: step.nodeType,
          phone: nodeData.telefone || '',
          message: nodeData.mensagem || '',
          status: 'pending'
        },
        updated_at: new Date().toISOString(),
      })
      .eq('id', executionId);

    console.log('Mensagem WhatsApp programada');
  };

  const processEndNode = async (executionId: string, step: ExecutionStep, nodeData: any) => {
    await supabase
      .from('flow_executions')
      .update({
        status: 'concluido',
        progress: 100,
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', executionId);

    // Criar notificação de conclusão
    createNotification({
      type: 'success',
      category: 'flow',
      title: 'Fluxo Concluído',
      message: 'O fluxo foi executado com sucesso até o final.',
      actionable: false,
    });

    console.log('Fluxo finalizado');
  };

  const handleStepError = async (executionId: string, step: ExecutionStep, error: Error) => {
    console.error(`Erro na etapa ${step.nodeType}:`, error);

    await supabase
      .from('flow_executions')
      .update({
        status: 'falha',
        current_step: {
          ...step,
          status: 'failed',
          error: error.message
        },
        updated_at: new Date().toISOString(),
      })
      .eq('id', executionId);

    createNotification({
      type: 'error',
      category: 'flow',
      title: 'Erro no Fluxo',
      message: `Erro na etapa ${step.nodeType}: ${error.message}`,
      actionable: true,
    });
  };

  const completeCurrentStep = useCallback(async (
    executionId: string,
    response: any
  ) => {
    try {
      setProcessing(true);

      const { data: execution } = await supabase
        .from('flow_executions')
        .select('*')
        .eq('id', executionId)
        .single();

      if (!execution) {
        throw new Error('Execução não encontrada');
      }

      // Update step completion
      const currentStep = execution.current_step || {};
      await supabase
        .from('flow_executions')
        .update({
          current_step: {
            ...(typeof currentStep === 'object' ? currentStep : {}),
            response,
            status: 'completed',
            completed_at: new Date().toISOString()
          },
          progress: Math.min((execution.progress || 0) + 10, 100),
          updated_at: new Date().toISOString(),
        })
        .eq('id', executionId);

      toast({
        title: "Etapa concluída",
        description: "Sua resposta foi salva com sucesso.",
      });

      return { success: true };
    } catch (error) {
      console.error('Erro ao completar etapa:', error);
      toast({
        title: "Erro",
        description: "Não foi possível salvar sua resposta. Tente novamente.",
        variant: "destructive",
      });
      return { success: false, error: (error as Error).message };
    } finally {
      setProcessing(false);
    }
  }, [toast]);

  return {
    executeFlowStep,
    completeCurrentStep,
    processing,
    isWhatsAppReady
  };
};