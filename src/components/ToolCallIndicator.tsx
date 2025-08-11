import { Activity, Clock, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { Badge } from './ui/badge';
import { Card } from './ui/card';

interface ToolCallIndicatorProps {
  status: 'pre-call' | 'calling' | 'success' | 'error';
  toolName?: string;
  duration?: number;
  compact?: boolean;
}

export const ToolCallIndicator = ({ 
  status, 
  toolName, 
  duration,
  compact = false 
}: ToolCallIndicatorProps) => {
  const getStatusConfig = () => {
    switch (status) {
      case 'pre-call':
        return {
          icon: <Clock className="h-3 w-3" />,
          color: 'bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800',
          text: 'Preparing...'
        };
      case 'calling':
        return {
          icon: <Loader2 className="h-3 w-3 animate-spin" />,
          color: 'bg-orange-500/10 text-orange-700 dark:text-orange-300 border-orange-200 dark:border-orange-800',
          text: 'Executing...'
        };
      case 'success':
        return {
          icon: <CheckCircle className="h-3 w-3" />,
          color: 'bg-green-500/10 text-green-700 dark:text-green-300 border-green-200 dark:border-green-800',
          text: 'Completed'
        };
      case 'error':
        return {
          icon: <XCircle className="h-3 w-3" />,
          color: 'bg-red-500/10 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800',
          text: 'Failed'
        };
    }
  };

  const config = getStatusConfig();

  if (compact) {
    return (
      <Badge variant="outline" className={`${config.color} gap-1.5 text-xs py-1`}>
        {config.icon}
        {toolName ? `${toolName} ${config.text.toLowerCase()}` : config.text}
        {duration && status === 'success' && (
          <span className="ml-1 opacity-70">({duration}ms)</span>
        )}
      </Badge>
    );
  }

  return (
    <Card className={`${config.color} p-3 my-2 animate-fade-in`}>
      <div className="flex items-center gap-2 text-sm">
        {config.icon}
        <span className="font-medium">
          {toolName ? `${toolName} - ${config.text}` : config.text}
        </span>
        {duration && status === 'success' && (
          <span className="ml-auto opacity-70 text-xs">
            {duration}ms
          </span>
        )}
      </div>
    </Card>
  );
};