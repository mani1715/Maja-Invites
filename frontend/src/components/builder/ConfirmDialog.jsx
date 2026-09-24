/**
 * ConfirmDialog.jsx — MAJA Dynamic Event Engine: shared destructive-action guard + UX states (Doc 11).
 * ====================================================================================================
 *
 * Doc 11 §Dialogs: "Dialogs should prevent accidental destructive actions"
 * (Publish / Archive / Delete / Transfer). One reusable confirmation dialog built
 * on the existing lux `ui/dialog` + `ui/button` — no bespoke modal. Also exports the
 * consistent EmptyState / ErrorState the module's pages share (Doc 11 §Empty/Error States).
 *
 * Reuse-first (Doc 11 §Visual Identity: "Do NOT redesign MAJA"): everything here is
 * the existing design system + theme variables — never hardcoded colors.
 */
import React from 'react';
import { AlertCircle, Loader2 } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription,
} from '../ui/dialog';
import { Button } from '../ui/button';

/**
 * Controlled confirmation dialog.
 * @param {object}   props
 * @param {boolean}  props.open
 * @param {Function} props.onOpenChange
 * @param {string}   props.title
 * @param {string}   props.description
 * @param {string}   props.confirmLabel   default "Confirm"
 * @param {boolean}  props.danger          red confirm button for destructive actions
 * @param {boolean}  props.loading
 * @param {Function} props.onConfirm
 */
export function ConfirmDialog({ open, onOpenChange, title, description,
                               confirmLabel = 'Confirm', danger = false,
                               loading = false, onConfirm }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {danger && <AlertCircle className="h-5 w-5 text-red-500" />}
            {title}
          </DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancel
          </Button>
          <Button
            variant={danger ? 'destructive' : 'default'}
            onClick={onConfirm}
            disabled={loading}
          >
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Consistent empty state (Doc 11 §Empty States: why + how + primary action). */
export function EmptyState({ icon: Icon, title, hint, action }) {
  return (
    <div className="flex flex-col items-center rounded-lg border border-dashed bg-muted/30 px-6 py-12 text-center">
      {Icon && <Icon className="mb-3 h-8 w-8 text-muted-foreground/50" />}
      <p className="text-sm font-medium">{title}</p>
      {hint && <p className="mt-1 max-w-xs text-sm text-muted-foreground">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/** Consistent error state with a recovery path (Doc 11 §Error States). */
export function ErrorState({ title = 'Something went wrong', message, onRetry }) {
  return (
    <div className="flex flex-col items-center rounded-lg border border-red-300/50 bg-red-50 px-6 py-10 text-center">
      <AlertCircle className="mb-2 h-6 w-6 text-red-500" />
      <p className="text-sm font-medium text-red-800">{title}</p>
      {message && <p className="mt-1 text-sm text-red-700">{message}</p>}
      {onRetry && (
        <Button variant="outline" size="sm" className="mt-4" onClick={onRetry}>Try again</Button>
      )}
    </div>
  );
}

export default ConfirmDialog;
