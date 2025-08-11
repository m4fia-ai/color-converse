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
      case 'campaign': return 'bg-primary/20 text-primary-foreground border-primary/30';
      case 'adset': return 'bg-tertiary/20 text-tertiary-foreground border-tertiary/30';
      case 'ad': return 'bg-secondary/20 text-secondary-foreground border-secondary/30';
      default: return 'bg-muted text-muted-foreground border-border';
    }
  };

  return (
    <Card className="mt-4 border-primary/30 bg-primary/5 shadow-lg">
      <CardHeader className="pb-3 bg-gradient-to-r from-primary/10 to-tertiary/10">
        <CardTitle className="flex items-center gap-2 text-primary font-semibold">
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
                  <Badge className={getTypeColor(item.type)} variant="outline">
                    {item.type.toUpperCase()}
                  </Badge>
                </TableCell>
                <TableCell className="font-medium text-foreground">{item.name}</TableCell>
                <TableCell className="font-mono text-sm text-muted-foreground">
                  {item.id || 'N/A'}
                </TableCell>
                <TableCell>
                  <Badge variant={item.status === 'ACTIVE' ? 'default' : 'secondary'} 
                         className={item.status === 'ACTIVE' ? 'bg-primary/20 text-primary border-primary/30' : ''}>
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