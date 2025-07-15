
import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from './button';
import { Card, CardContent, CardHeader, CardTitle } from './card';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  retryCount: number;
}

export class MobileErrorBoundary extends Component<Props, State> {
  private retryTimeout: NodeJS.Timeout | null = null;

  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, retryCount: 0 };
  }

  static getDerivedStateFromError(error: Error): State {
    // Check if it's a DOM manipulation error (common with Google Translate)
    const isDOMError = error.message.includes('removeChild') ||
                      error.message.includes('Node') ||
                      error.message.includes('DOM');
    
    return {
      hasError: true,
      error: isDOMError ? error : null,
      retryCount: 0
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('MobileErrorBoundary caught an error:', error, errorInfo);
    
    // Auto-retry for DOM errors (common with Google Translate interference)
    if (this.isDOMError(error) && this.state.retryCount < 3) {
      this.scheduleRetry();
    }
  }

  private isDOMError = (error: Error): boolean => {
    return error.message.includes('removeChild') ||
           error.message.includes('Node') ||
           error.message.includes('insertBefore') ||
           error.message.includes('appendChild');
  };

  private scheduleRetry = () => {
    if (this.retryTimeout) {
      clearTimeout(this.retryTimeout);
    }
    
    this.retryTimeout = setTimeout(() => {
      this.setState(prevState => ({
        hasError: false,
        error: null,
        retryCount: prevState.retryCount + 1
      }));
    }, 1000 + (this.state.retryCount * 500)); // Progressive delay
  };

  private handleManualRetry = () => {
    this.setState({
      hasError: false,
      error: null,
      retryCount: 0
    });
  };

  componentWillUnmount() {
    if (this.retryTimeout) {
      clearTimeout(this.retryTimeout);
    }
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-screen bg-gradient-to-br from-gray-50 via-gray-100 to-gray-200 dark:bg-[#0E0E0E] p-6 flex items-center justify-center">
          <Card className="max-w-md mx-auto shadow-lg border-0 bg-white/90 dark:bg-[#0E0E0E]/90 backdrop-blur-sm">
            <CardHeader className="text-center">
              <div className="w-16 h-16 bg-gradient-to-r from-orange-500 to-orange-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <AlertTriangle className="h-8 w-8 text-white" />
              </div>
              <CardTitle className="text-xl text-gray-900 dark:text-gray-100">
                Algo deu errado
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-center">
              <p className="text-gray-600 dark:text-gray-400">
                {this.isDOMError(this.state.error) 
                  ? "Detectamos um problema de compatibilidade. Isso pode acontecer quando acessado via WhatsApp ou com tradutores automáticos ativos."
                  : "Ocorreu um erro inesperado. Tente novamente."
                }
              </p>
              
              {this.state.retryCount < 3 && (
                <p className="text-sm text-orange-600 dark:text-orange-400">
                  Tentando reconectar automaticamente... ({this.state.retryCount + 1}/3)
                </p>
              )}

              <div className="space-y-3">
                <Button 
                  onClick={this.handleManualRetry}
                  className="w-full bg-primary-gradient hover:opacity-90 text-white"
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Tentar Novamente
                </Button>
                
                <Button 
                  variant="outline"
                  onClick={() => window.location.reload()}
                  className="w-full"
                >
                  Recarregar Página
                </Button>
              </div>

              {this.isDOMError(this.state.error) && (
                <div className="mt-4 p-3 bg-orange-50 dark:bg-orange-950/20 rounded-lg border border-orange-200 dark:border-orange-800/50">
                  <p className="text-xs text-orange-700 dark:text-orange-300">
                    💡 Dica: Se o problema persistir, tente desativar a tradução automática ou abrir em um navegador diferente.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}
