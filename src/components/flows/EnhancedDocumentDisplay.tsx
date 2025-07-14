
import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Download, Eye, Play, Pause, Volume2, VolumeX, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

interface EnhancedDocumentDisplayProps {
  fileName: string;
  fileUrl: string;
  fileType: string;
  title?: string;
  description?: string;
}

export const EnhancedDocumentDisplay: React.FC<EnhancedDocumentDisplayProps> = ({
  fileName,
  fileUrl,
  fileType,
  title,
  description
}) => {
  const [downloading, setDownloading] = useState(false);
  const [videoPlaying, setVideoPlaying] = useState(false);
  const [videoMuted, setVideoMuted] = useState(false);
  const [fileExists, setFileExists] = useState(true);
  const [checkingFile, setCheckingFile] = useState(true);

  useEffect(() => {
    checkFileExists();
  }, [fileUrl]);

  const checkFileExists = async () => {
    setCheckingFile(true);
    try {
      // ✨ MELHORADO: Verificar ambos os buckets com prioridade para clinic-materials
      const urls = [
        fileUrl,
        // Clinic-materials (bucket principal)
        `https://oilnybhaboefqyhjrmvl.supabase.co/storage/v1/object/public/clinic-materials/${fileName}`,
        `https://oilnybhaboefqyhjrmvl.supabase.co/storage/v1/object/public/clinic-materials/${fileUrl.split('/').pop()}`,
        // Flow-documents (fallback para compatibilidade)
        `https://oilnybhaboefqyhjrmvl.supabase.co/storage/v1/object/public/flow-documents/${fileName}`,
        `https://oilnybhaboefqyhjrmvl.supabase.co/storage/v1/object/public/flow-documents/${fileUrl.split('/').pop()}`
      ].filter(url => url && url.trim());

      console.log('🔍 EnhancedDocumentDisplay: Verificando URLs:', urls);

      for (const url of urls) {
        try {
          const response = await fetch(url, { method: 'HEAD' });
          if (response.ok && response.status === 200) {
            console.log('✅ Arquivo encontrado em:', url);
            setFileExists(true);
            setCheckingFile(false);
            return;
          }
        } catch (urlError) {
          console.warn('❌ URL falhou:', url, urlError.message);
        }
      }
      
      console.error('❌ Arquivo não encontrado em nenhuma URL:', urls);
      setFileExists(false);
    } catch (error) {
      console.error('Erro ao verificar arquivo:', error);
      setFileExists(false);
    } finally {
      setCheckingFile(false);
    }
  };

  const handleDownload = async () => {
    setDownloading(true);
    try {
      // ✨ MELHORADO: Priorizar clinic-materials sobre flow-documents
      const urls = [
        fileUrl,
        // Clinic-materials (bucket principal)
        `https://oilnybhaboefqyhjrmvl.supabase.co/storage/v1/object/public/clinic-materials/${fileName}`,
        `https://oilnybhaboefqyhjrmvl.supabase.co/storage/v1/object/public/clinic-materials/${fileUrl.split('/').pop()}`,
        // Flow-documents (fallback)
        `https://oilnybhaboefqyhjrmvl.supabase.co/storage/v1/object/public/flow-documents/${fileName}`,
        `https://oilnybhaboefqyhjrmvl.supabase.co/storage/v1/object/public/flow-documents/${fileUrl.split('/').pop()}`
      ].filter(url => url && url.trim());

      console.log('📥 EnhancedDocumentDisplay: Tentando download das URLs:', urls);
      let downloadSuccessful = false;
      
      for (const url of urls) {
        try {
          console.log(`🔄 Tentativa de download: ${url}`);
          const response = await fetch(url);
          if (response.ok) {
            const blob = await response.blob();
            
            if (blob.size > 0) {
              const link = document.createElement('a');
              link.href = URL.createObjectURL(blob);
              link.download = fileName;
              document.body.appendChild(link);
              link.click();
              document.body.removeChild(link);
              URL.revokeObjectURL(link.href);
              
              console.log(`✅ Download bem-sucedido de: ${url}`);
              toast.success('Download iniciado!');
              downloadSuccessful = true;
              break;
            } else {
              console.warn(`⚠️ Arquivo vazio: ${url}`);
            }
          } else {
            console.warn(`❌ HTTP ${response.status}: ${url}`);
          }
        } catch (urlError) {
          console.warn('❌ Falha no download da URL:', url, urlError.message);
        }
      }
      
      if (!downloadSuccessful) {
        console.error('❌ Todas as tentativas de download falharam');
        toast.error('Arquivo não disponível para download. Entre em contato com sua clínica.');
      }
    } catch (error) {
      console.error('Erro ao baixar arquivo:', error);
      toast.error('Erro ao baixar arquivo');
    } finally {
      setDownloading(false);
    }
  };

  const handlePreview = () => {
    if (!fileExists) {
      toast.error('Arquivo não encontrado');
      return;
    }
    window.open(fileUrl, '_blank');
  };

  if (checkingFile) {
    return (
      <Card className="bg-gradient-to-r from-gray-50 to-gray-100 dark:bg-none dark:bg-[#0E0E0E]/20">
        <CardContent className="p-6 text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Verificando arquivo...</p>
        </CardContent>
      </Card>
    );
  }

  if (!fileExists) {
    return (
      <Card className="bg-gradient-to-r from-red-50 to-orange-50 dark:from-red-950/20 dark:to-orange-950/20 border-red-200 dark:border-red-800">
        <CardContent className="p-6 text-center">
          <div className="w-16 h-16 bg-red-100 dark:bg-red-950/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="h-8 w-8 text-red-500" />
          </div>
          <h3 className="text-lg font-semibold text-red-900 dark:text-red-100 mb-2">
            Arquivo não encontrado
          </h3>
          <p className="text-red-700 dark:text-red-300 mb-4">
            O arquivo "{fileName}" não está disponível no momento.
          </p>
          <p className="text-sm text-red-600 dark:text-red-400">
            Entre em contato com sua clínica para obter o documento.
          </p>
        </CardContent>
      </Card>
    );
  }

  const renderContent = () => {
    if (fileType.startsWith('image/')) {
      return (
        <div className="space-y-4">
          <img
            src={fileUrl}
            alt={title || fileName}
            className="w-full max-w-2xl mx-auto rounded-lg shadow-sm"
            onError={() => {
              console.error('Erro ao carregar imagem');
              setFileExists(false);
            }}
          />
        </div>
      );
    }

    if (fileType.startsWith('video/')) {
      return (
        <div className="space-y-4">
          <div className="relative bg-black rounded-lg overflow-hidden max-w-2xl mx-auto">
            <video
              src={fileUrl}
              controls
              className="w-full"
              onPlay={() => setVideoPlaying(true)}
              onPause={() => setVideoPlaying(false)}
              onVolumeChange={(e) => setVideoMuted((e.target as HTMLVideoElement).muted)}
              onError={() => {
                console.error('Erro ao carregar vídeo');
                setFileExists(false);
              }}
            >
              Seu browser não suporta reprodução de vídeo.
            </video>
          </div>
        </div>
      );
    }

    // Para PDFs e outros documentos
    return (
      <div className="text-center py-8">
        <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <Eye className="h-10 w-10 text-red-500" />
        </div>
        <p className="text-gray-600 mb-4">
          📎 {fileName}
        </p>
        <Button
          onClick={handlePreview}
          variant="outline"
          className="mb-2"
        >
          <Eye className="h-4 w-4 mr-2" />
          Visualizar PDF
        </Button>
      </div>
    );
  };

  return (
    <Card className="bg-muted/50 dark:bg-muted/20 border-border">
      <CardContent className="p-6 space-y-6">
        {title && (
          <div className="text-center">
            <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
              {title}
            </h3>
            {description && (
              <p className="text-gray-600 dark:text-gray-400">
                {description}
              </p>
            )}
          </div>
        )}

        {renderContent()}

        <div className="flex justify-center gap-3">
          <Button
            onClick={handleDownload}
            disabled={downloading}
            className="bg-primary-gradient hover:opacity-90 text-white"
          >
            <Download className="h-4 w-4 mr-2" />
            {downloading ? 'Baixando...' : 'Baixar'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};
