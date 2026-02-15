import { memo, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Trash2 } from 'lucide-react';

interface RowActionsProps {
  hasContent: boolean;
  fieldName: string;
  fieldComment: string;
  onRemove: () => void;
}

export const RowActions = memo<RowActionsProps>(
  ({ hasContent, fieldName, fieldComment, onRemove }) => {
    const [confirmOpen, setConfirmOpen] = useState(false);

    const handleDelete = () => {
      if (hasContent) {
        setConfirmOpen(true);
      } else {
        onRemove();
      }
    };

    return (
      <div className="flex h-8 items-center justify-center">
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-muted-foreground hover:text-destructive"
          onClick={handleDelete}
          title="删除行"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>

        <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>删除字段行</AlertDialogTitle>
              <AlertDialogDescription>
                确定要删除此行吗？
                <br />
                <span className="mt-2 block text-foreground">
                  字段名: {fieldName || '(空)'}
                </span>
                <span className="block text-foreground">
                  中文名: {fieldComment || '(空)'}
                </span>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>取消</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  onRemove();
                  setConfirmOpen(false);
                }}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                确定删除
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    );
  },
);

RowActions.displayName = 'RowActions';
