
import React from 'react';
import { Handle, Position } from '@xyflow/react';
import { FileCheck, Download } from 'lucide-react';
import { SimpleNodeActions } from '../SimpleNodeActions';
import { NodeHelpButton } from '@/components/ui/node-help-button';

interface FormEndNodeProps {
  data: any;
  selected?: boolean;
  id: string;
  onDelete?: (nodeId: string) => void;
  onDuplicate?: (nodeId: string) => void;
}

export const FormEndNode: React.FC<FormEndNodeProps> = ({ data, selected, id, onDelete, onDuplicate }) => {
  return (
    <div className={`group relative transition-all duration-200 ${
      selected ? 'scale-105' : ''
    }`}>
      <div className={`min-w-40 w-auto h-auto min-h-20 rounded-xl bg-white dark:bg-gray-800/90 border border-gray-200 dark:border-gray-700 shadow-sm transition-all duration-200 relative overflow-hidden ${
        selected 
          ? 'border-[#5D8701] shadow-[0_0_0_2px_rgba(93,135,1,0.2)]' 
          : 'border-gray-200 dark:border-gray-700'
      }`}>
        {/* Header Section */}
        <div className="flex items-center justify-between px-3 py-2">
          <div className="flex items-center gap-2">
            <FileCheck className="h-4 w-4 text-purple-500" />
            <span className="text-sm font-medium text-gray-900 dark:text-gray-100">Fim Formulário</span>
          </div>
          <NodeHelpButton nodeType="formEnd" />
        </div>
        
        {/* Divider */}
        <div className="border-t border-gray-200 dark:border-gray-600"></div>
        
        {/* Content Section */}
        <div className="px-3 py-2">
          <div className="flex items-center gap-1 text-xs text-gray-600 dark:text-gray-400">
            <Download className="h-3 w-3" />
            <span>
              {data.arquivos?.length > 0 
                ? `${data.arquivos.length} arquivo(s)`
                : 'Sem arquivos'
              }
            </span>
          </div>
          {data.titulo && (
            <div className="text-xs text-gray-500 dark:text-gray-500 truncate mt-1">
              {data.titulo}
            </div>
          )}
        </div>
      </div>
      
      <SimpleNodeActions
        nodeId={id}
        nodeType="formEnd"
        onDelete={data?.onDelete}
        onEdit={data?.onEdit}
        onDuplicate={data?.onDuplicate}
        show={selected}
      />
      
      <Handle
        type="target"
        position={Position.Left}
        className="w-3.5 h-3.5 bg-[#5D8701] border-2 border-white shadow-md !left-0 !transform !-translate-x-1/2 !-translate-y-1/2"
      />
      <Handle
        type="source"
        position={Position.Right}
        className="w-3.5 h-3.5 bg-[#5D8701] border-2 border-white shadow-md !right-0 !transform !translate-x-1/2 !-translate-y-1/2"
      />
    </div>
  );
};
