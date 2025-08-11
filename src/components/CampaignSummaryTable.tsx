import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { CheckCircle } from 'lucide-react';

interface CampaignItem {
  type: 'campaign' | 'adset' | 'ad';
  name: string;
  id?: string;
  status?: string;
  budget?: string;
  targeting?: string;
  creative?: string;
}

interface CampaignSummaryTableProps {
  items: CampaignItem[];
  title: string;
}

export const CampaignSummaryTable = ({ items, title }: CampaignSummaryTableProps) => {
  if (items.length === 0) return null;

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'campaign': return 'bg-blue-500/10 text-blue-700 dark:text-blue-300';
      case 'adset': return 'bg-green-500/10 text-green-700 dark:text-green-300';
      case 'ad': return 'bg-purple-500/10 text-purple-700 dark:text-purple-300';
      default: return 'bg-gray-500/10 text-gray-700 dark:text-gray-300';
    }
  };

  return (
    <Card className="mt-4 border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-950/30">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-green-700 dark:text-green-300">
          <CheckCircle className="h-5 w-5" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Type</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>ID</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Details</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item, index) => (
              <TableRow key={index}>
                <TableCell>
                  <Badge className={getTypeColor(item.type)}>
                    {item.type.toUpperCase()}
                  </Badge>
                </TableCell>
                <TableCell className="font-medium">{item.name}</TableCell>
                <TableCell className="font-mono text-sm text-muted-foreground">
                  {item.id || 'N/A'}
                </TableCell>
                <TableCell>
                  <Badge variant={item.status === 'ACTIVE' ? 'default' : 'secondary'}>
                    {item.status || 'N/A'}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {item.budget && <div>Budget: {item.budget}</div>}
                  {item.targeting && <div>Targeting: {item.targeting}</div>}
                  {item.creative && <div>Creative: {item.creative}</div>}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
};