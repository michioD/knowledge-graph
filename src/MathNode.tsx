import { Handle, Position } from '@xyflow/react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';

export type MathNodeData = {
  label: string; // the name/title
  content: string; // latex content
  type: 'definition' | 'theorem' | 'axiom';
  expanded?: boolean;
};

const MathNode = ({ data }: { data: MathNodeData }) => {

  // Blue for definition, Red for theorem, Green for axiom
  const bgColor = data.type === 'definition' 
    ? 'bg-blue-100 border-blue-500 text-blue-900' 
    : data.type === 'axiom'
      ? 'bg-green-100 border-green-500 text-green-900'
      : 'bg-red-100 border-red-500 text-red-900';
      
  const labelBg = data.type === 'definition' 
    ? 'bg-blue-500' 
    : data.type === 'axiom'
      ? 'bg-green-500'
      : 'bg-red-500';

  if (!data.expanded) {
    return (
      <div className={`shadow-lg rounded-full border-2 w-28 h-28 flex items-center justify-center p-3 text-center cursor-pointer transition-all hover:scale-105 hover:shadow-xl ${bgColor}`}>
        <Handle type="target" position={Position.Top} className="w-4 h-4 bg-yellow-400 border-2 border-white opacity-0 transition-opacity hover:opacity-100" />
        <span className="text-sm font-bold break-words">{data.label}</span>
        <Handle type="source" position={Position.Bottom} className="w-4 h-4 bg-yellow-400 border-2 border-white opacity-0 transition-opacity hover:opacity-100" />
      </div>
    );
  }

  return (
    <div className={`shadow-md rounded-md border-2 min-w-[200px] max-w-[400px] transition-all cursor-pointer relative ${bgColor}`}>
      <Handle 
        type="target" 
        position={Position.Left} 
        style={{ top: '-12px', left: '-12px', transform: 'none' }}
        className="!w-6 !h-6 !bg-yellow-400 !border-2 !border-white shadow-md cursor-crosshair hover:!bg-yellow-300 transition-colors z-10" 
      />
      
      <div className={`px-2 py-1 text-white font-bold text-sm rounded-t-sm flex justify-between ${labelBg}`}>
        <span>{data.type.toUpperCase()}</span>
        <span className="truncate ml-2">{data.label}</span>
      </div>
      <div 
        className="p-3 bg-white/80 rounded-b-sm cursor-text markdown-body overflow-x-auto" 
        onClick={(e) => e.stopPropagation()}
      >
        <ReactMarkdown
          remarkPlugins={[remarkMath]}
          rehypePlugins={[rehypeKatex]}
          components={{
            p: ({node, ...props}) => <p className="mb-2 last:mb-0" {...props} />,
            ul: ({node, ...props}) => <ul className="list-disc pl-5 mb-2" {...props} />,
            ol: ({node, ...props}) => <ol className="list-decimal pl-5 mb-2" {...props} />,
            h1: ({node, ...props}) => <h1 className="text-lg font-bold mb-2 mt-2" {...props} />,
            h2: ({node, ...props}) => <h2 className="text-md font-bold mb-2 mt-2" {...props} />,
            h3: ({node, ...props}) => <h3 className="text-sm font-bold mb-1 mt-1" {...props} />,
            a: ({node, ...props}) => <a className="text-blue-600 hover:underline" {...props} />
          }}
        >
          {data.content}
        </ReactMarkdown>
      </div>
      
      <Handle 
        type="source" 
        position={Position.Right} 
        style={{ top: 'auto', bottom: '-12px', right: '-12px', left: 'auto', transform: 'none' }}
        className="!w-6 !h-6 !bg-yellow-400 !border-2 !border-white shadow-md cursor-crosshair hover:!bg-yellow-300 transition-colors z-10" 
      />
    </div>
  );
};

export default MathNode;
