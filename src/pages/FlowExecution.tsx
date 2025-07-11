
import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { ArrowLeft, CheckCircle, Play, Clock, History } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { toast } from 'sonner';
import { FlowStepRenderer } from '@/components/flows/FlowStepRenderer';
import { DelayTimer } from '@/components/flows/DelayTimer';
import { useFlowProcessor } from '@/hooks/useFlowProcessor';

interface FlowExecution {
  id: string;
  flow_id: string;
  flow_name: string;
  patient_id: string;
  status: string;
  current_node: string;
  progress: number;
  total_steps: number;
  completed_steps: number;
  current_step: any;
  created_at: string;
  updated_at: string;
  next_step_available_at?: string;
}

const FlowExecution = () => {
  const { executionId } = useParams<{ executionId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { completeFlowStep, goBackToStep } = useFlowProcessor();
  const [execution, setExecution] = useState<FlowExecution | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [showStepNavigation, setShowStepNavigation] = useState(false);

  useEffect(() => {
    if (!executionId || !user) return;

    const loadExecution = async () => {
      try {
        console.log('Loading execution with ID:', executionId);
        
        const { data, error } = await supabase
          .from('flow_executions')
          .select('*')
          .eq('id', executionId)
          .eq('patient_id', user.id)
          .single();

        if (error || !data) {
          console.error('Erro ao carregar execução:', error);
          toast.error('Execução não encontrada');
          navigate('/my-flows');
          return;
        }

        console.log('Execution loaded:', data);
        setExecution(data as FlowExecution);
        
        if (data.current_step && typeof data.current_step === 'object' && 'currentStepIndex' in data.current_step) {
          const stepsData = data.current_step as { steps: any[]; currentStepIndex?: number };
          const savedIndex = stepsData.currentStepIndex;
          
          if (typeof savedIndex === 'number' && savedIndex >= 0) {
            setCurrentStepIndex(savedIndex);
          } else {
            const firstIncompleteIndex = stepsData.steps.findIndex((step: any) => !step.completed);
            setCurrentStepIndex(firstIncompleteIndex >= 0 ? firstIncompleteIndex : 0);
          }
        }
      } catch (error) {
        console.error('Erro ao carregar execução:', error);
        toast.error('Erro ao carregar execução');
        navigate('/my-flows');
      } finally {
        setLoading(false);
      }
    };

    loadExecution();

    const interval = setInterval(loadExecution, 10000);
    return () => clearInterval(interval);
  }, [executionId, user, navigate]);

  const handleStepComplete = async (stepResponse: any) => {
    if (!execution || updating) return;

    setUpdating(true);
    try {
      const currentStepData = execution.current_step as { steps?: any[]; currentStepIndex?: number } | null;
      const steps = currentStepData?.steps || [];
      const currentStep = steps[currentStepIndex];
      
      if (!currentStep) {
        toast.error('Etapa não encontrada');
        return;
      }

      await completeFlowStep(execution.id, currentStep.nodeId, stepResponse);
      
      const { data: updatedExecution } = await supabase
        .from('flow_executions')
        .select('*')
        .eq('id', execution.id)
        .single();

      if (updatedExecution) {
        setExecution(updatedExecution as FlowExecution);
        
        const updatedStepData = updatedExecution.current_step as { currentStepIndex?: number };
        if (typeof updatedStepData.currentStepIndex === 'number') {
          setCurrentStepIndex(updatedStepData.currentStepIndex);
        }

        if (updatedExecution.status === 'completed') {
          setTimeout(() => navigate('/'), 2000);
        }
      }
    } catch (error) {
      console.error('Erro ao completar etapa:', error);
    } finally {
      setUpdating(false);
    }
  };

  const handleGoBack = async () => {
    if (!execution || currentStepIndex <= 0) return;

    const targetIndex = currentStepIndex - 1;
    try {
      await goBackToStep(execution.id, targetIndex);
      setCurrentStepIndex(targetIndex);
      
      // Reload execution
      const { data: updatedExecution } = await supabase
        .from('flow_executions')
        .select('*')
        .eq('id', execution.id)
        .single();

      if (updatedExecution) {
        setExecution(updatedExecution as FlowExecution);
      }
    } catch (error) {
      console.error('Erro ao voltar etapa:', error);
    }
  };

  const handleStepNavigation = async (stepIndex: number) => {
    if (!execution) return;

    const currentStepData = execution.current_step as { steps?: any[] };
    const steps = currentStepData?.steps || [];
    const targetStep = steps[stepIndex];

    if (!targetStep || !targetStep.completed) {
      toast.error('Você só pode navegar para etapas já completadas');
      return;
    }

    try {
      await goBackToStep(execution.id, stepIndex);
      setCurrentStepIndex(stepIndex);
      setShowStepNavigation(false);

      // Reload execution
      const { data: updatedExecution } = await supabase
        .from('flow_executions')
        .select('*')
        .eq('id', execution.id)
        .single();

      if (updatedExecution) {
        setExecution(updatedExecution as FlowExecution);
      }
    } catch (error) {
      console.error('Erro na navegação:', error);
    }
  };

  const handleDelayExpired = () => {
    // Force reload execution to get updated status when delay expires
    if (executionId && user) {
      supabase
        .from('flow_executions')
        .select('*')
        .eq('id', executionId)
        .eq('patient_id', user.id)
        .single()
        .then(({ data, error }) => {
          if (!error && data) {
            // Check if delay has actually expired
            const now = new Date();
            const nextAvailable = data.next_step_available_at ? new Date(data.next_step_available_at) : null;
            
            if (!nextAvailable || now >= nextAvailable) {
              // Update status to active if delay expired
              supabase
                .from('flow_executions')
                .update({
                  status: 'in-progress', // Use valid status
                  next_step_available_at: null,
                  updated_at: new Date().toISOString()
                })
                .eq('id', executionId)
                .then(() => {
                  setExecution(prev => prev ? {...prev, status: 'in-progress', next_step_available_at: null} : null);
                  const updatedStepData = data.current_step as { currentStepIndex?: number };
                  if (typeof updatedStepData.currentStepIndex === 'number') {
                    setCurrentStepIndex(updatedStepData.currentStepIndex);
                  }
                  toast.success('Próximo formulário liberado!');
                });
            }
          }
        });
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner />
        <p className="text-muted-foreground ml-2">Carregando formulário...</p>
      </div>
    );
  }

  if (!execution) {
    return null;
  }

  const isCompleted = execution.status === 'completed' || execution.progress >= 100;
  const currentStepData = execution.current_step as { 
    steps?: any[]; 
    currentStepIndex?: number; 
    calculatorResults?: Record<string, number>;
  } | null;
  const steps = currentStepData?.steps || [];
  const currentStep = steps[currentStepIndex];
  const isWaiting = execution.status === 'pending' && execution.next_step_available_at;
  const isActive = execution.status === 'in-progress' || execution.status === 'em-andamento';
  const completedSteps = steps.filter((step: any) => step.completed).length;

  // Get calculator result for conditions step
  const calculatorResults = currentStepData?.calculatorResults || {};
  const calculatorResult = currentStep?.calculatorResult || 
    Object.values(calculatorResults).pop() || 0;

  const delayExpired = execution.next_step_available_at ? 
    new Date() >= new Date(execution.next_step_available_at) : false;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:bg-none dark:bg-[#0E0E0E] p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header Simplificado */}
        <div className="flex items-center justify-between mb-6">
          <Button
            variant="ghost"
            onClick={() => navigate('/my-flows')}
            className="flex items-center gap-2 text-gray-600 dark:text-gray-400"
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar
          </Button>
          
          {/* Botão de voltar etapa sempre visível quando há etapas anteriores */}
          {currentStepIndex > 0 && steps.length > 0 && (
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={handleGoBack}
                size="sm"
                className="flex items-center gap-2"
              >
                <ArrowLeft className="h-3 w-3" />
                Voltar Etapa
              </Button>
              
              {/* Navegação por etapas */}
              {completedSteps > 1 && (
                <Button
                  variant="ghost"
                  onClick={() => setShowStepNavigation(!showStepNavigation)}
                  size="sm"
                  className="flex items-center gap-2"
                >
                  <History className="h-3 w-3" />
                  Ver Etapas
                </Button>
              )}
            </div>
          )}
        </div>

        {/* Título do Formulário */}
        <div className="text-center mb-6">
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
            {execution.flow_name}
          </h1>
          <div className="flex items-center justify-center gap-2 text-sm text-gray-500 dark:text-gray-400">
            <span>Etapa {currentStepIndex + 1} de {steps.length}</span>
            <div className="w-1 h-1 bg-gray-400 rounded-full"></div>
            <span>{execution.progress}% concluído</span>
          </div>
        </div>

        {/* Progress Bar e Navegação de Etapas */}
        <div className="mb-6">
          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
            <div 
              className="bg-gradient-to-r from-[#5D8701] to-[#4a6e01] h-2 rounded-full transition-all duration-300"
              style={{ width: `${execution.progress || 0}%` }}
            ></div>
          </div>
          
          {/* Navegação de etapas expandida */}
          {showStepNavigation && steps.length > 0 && (
            <div className="mt-4 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <h4 className="text-sm font-medium mb-3 text-gray-700 dark:text-gray-300">
                Etapas do Formulário
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                {steps.map((step: any, index: number) => (
                  <button
                    key={index}
                    onClick={() => handleStepNavigation(index)}
                    disabled={!step.completed && index !== currentStepIndex}
                    className={`
                      p-2 rounded text-xs text-left transition-colors
                      ${index === currentStepIndex 
                        ? 'bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 border-2 border-blue-300' 
                        : step.completed 
                        ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 hover:bg-green-100 dark:hover:bg-green-900/30' 
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed'
                      }
                    `}
                  >
                    <div className="flex items-center gap-1">
                      {step.completed ? (
                        <CheckCircle className="h-3 w-3" />
                      ) : index === currentStepIndex ? (
                        <Play className="h-3 w-3" />
                      ) : (
                        <Clock className="h-3 w-3" />
                      )}
                      <span className="truncate">
                        {step.title || `Etapa ${index + 1}`}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Delay Timer - Show when waiting and delay hasn't expired */}
        {isWaiting && execution.next_step_available_at && !delayExpired && (
          <DelayTimer
            availableAt={execution.next_step_available_at}
            onDelayExpired={handleDelayExpired}
          />
        )}

        {/* Formulário Principal */}
        <Card className="bg-white/90 dark:bg-none dark:bg-[#0E0E0E]/90 backdrop-blur-sm border-0 shadow-lg">
          <CardContent className="p-6 space-y-6">
            {isCompleted ? (
              <div className="text-center py-12">
                <div className="w-24 h-24 bg-green-100 dark:bg-green-900/20 rounded-full flex items-center justify-center mx-auto mb-6">
                  <CheckCircle className="h-16 w-16 text-green-500" />
                </div>
                <h2 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-4">
                  🎉 Parabéns!
                </h2>
                <p className="text-lg text-gray-600 dark:text-gray-400 mb-8">
                  Você concluiu todo o formulário com sucesso!
                </p>
                <Button
                  onClick={() => navigate('/')}
                  size="lg"
                  className="bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white px-8"
                >
                  Voltar ao Dashboard
                </Button>
              </div>
            ) : currentStep && (isActive || (!isWaiting || delayExpired)) ? (
              <div className="space-y-6">
                <FlowStepRenderer
                  step={currentStep}
                  onComplete={handleStepComplete}
                  isLoading={updating}
                  calculatorResult={calculatorResult}
                />
              </div>
            ) : !currentStep && steps.length === 0 ? (
              <div className="text-center py-12">
                <div className="w-24 h-24 bg-blue-100 dark:bg-blue-900/20 rounded-full flex items-center justify-center mx-auto mb-6">
                  <Play className="h-16 w-16 text-blue-500" />
                </div>
                <h3 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 mb-4">
                  📋 Preparando formulário...
                </h3>
                <p className="text-gray-600 dark:text-gray-400 mb-8">
                  Estamos configurando seu formulário. Aguarde um momento.
                </p>
                <Button
                  onClick={() => window.location.reload()}
                  variant="outline"
                  size="lg"
                >
                  Recarregar Página
                </Button>
              </div>
            ) : (
              <div className="text-center py-12">
                <div className="w-24 h-24 bg-orange-100 dark:bg-orange-900/20 rounded-full flex items-center justify-center mx-auto mb-6">
                  <Clock className="h-16 w-16 text-orange-500" />
                </div>
                <h3 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 mb-4">
                  ⏰ Aguarde um pouco...
                </h3>
                <p className="text-gray-600 dark:text-gray-400 mb-8">
                  Sua próxima etapa será liberada automaticamente no tempo programado.
                  Você pode fechar esta página e voltar depois.
                </p>
                <Button
                  onClick={() => navigate('/')}
                  variant="outline"
                  size="lg"
                >
                  Voltar ao Dashboard
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default FlowExecution;
