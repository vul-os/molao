import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AlertCircle, Download, FileText, RefreshCw } from "lucide-react";
import { formatCurrency, formatDate } from './hooks';

export const ChangePlanDialog = ({ 
  isPlanChangeDialogOpen, 
  setIsPlanChangeDialogOpen, 
  selectedPlanId, 
  plans, 
  planChangeLoading, 
  handleChangePlan 
}) => (
  <Dialog open={isPlanChangeDialogOpen} onOpenChange={setIsPlanChangeDialogOpen}>
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle className="font-serif">Change Subscription Plan</DialogTitle>
        <DialogDescription>
          You are about to change your subscription plan. This will take effect immediately.
        </DialogDescription>
      </DialogHeader>
      <div className="py-4">
        {plans.map(plan => {
          if (plan.id !== selectedPlanId) return null;
          return (
            <div key={plan.id} className="border border-amber-200 bg-amber-50 rounded-lg p-4">
              <h3 className="font-serif text-lg font-medium text-slate-800">{plan.name}</h3>
              <div className="mt-1 mb-2">
                <span className="text-xl font-bold text-slate-800">{formatCurrency(plan.price_cents)}</span>
                <span className="text-slate-500 ml-1 text-sm">/month</span>
              </div>
              <p className="text-slate-600 text-sm">{plan.description}</p>
            </div>
          );
        })}
      </div>
      <DialogFooter>
        <Button 
          variant="outline" 
          onClick={() => setIsPlanChangeDialogOpen(false)}
          disabled={planChangeLoading}
        >
          Cancel
        </Button>
        <Button 
          className="bg-slate-800 hover:bg-slate-700"
          onClick={handleChangePlan}
          disabled={planChangeLoading}
        >
          {planChangeLoading ? (
            <>
              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              Processing...
            </>
          ) : (
            'Confirm Change'
          )}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);

export const ViewInvoiceDialog = ({ 
  viewingInvoice, 
  setViewingInvoice, 
  handleDownloadInvoice 
}) => (
  <Dialog open={!!viewingInvoice} onOpenChange={(open) => !open && setViewingInvoice(null)}>
    <DialogContent className="sm:max-w-2xl">
      <DialogHeader>
        <DialogTitle className="font-serif">Invoice {viewingInvoice?.invoice_number}</DialogTitle>
        <DialogDescription>
          Invoice details for {formatDate(viewingInvoice?.created_at)}
        </DialogDescription>
      </DialogHeader>
      {viewingInvoice && (
        <div className="py-4">
          <div className="border border-slate-200 rounded-lg p-6 mb-4">
            <div className="flex justify-between items-start mb-6">
              <div>
                <h3 className="font-serif text-xl font-medium text-slate-800">INVOICE</h3>
                <p className="text-slate-600 text-sm">{viewingInvoice.invoice_number}</p>
                <p className="text-slate-600 text-sm mt-1">Date: {formatDate(viewingInvoice.created_at)}</p>
                <p className="text-slate-600 text-sm">Due Date: {formatDate(viewingInvoice.due_date)}</p>
              </div>
              <div className="text-right">
                <Badge 
                  variant="outline" 
                  className={`
                    ${viewingInvoice.status === 'paid' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : ''}
                    ${viewingInvoice.status === 'pending' ? 'bg-amber-50 text-amber-700 border-amber-200' : ''}
                    ${viewingInvoice.status === 'draft' ? 'bg-slate-50 text-slate-700 border-slate-200' : ''}
                    ${viewingInvoice.status === 'failed' ? 'bg-red-50 text-red-700 border-red-200' : ''}
                  `}
                >
                  {viewingInvoice.status.charAt(0).toUpperCase() + viewingInvoice.status.slice(1)}
                </Badge>
              </div>
            </div>
            
            <div className="border-t border-slate-200 my-4 pt-4">
              <h4 className="font-medium text-slate-800 mb-2">Line Items</h4>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Description</TableHead>
                    <TableHead className="text-right">Quantity</TableHead>
                    <TableHead className="text-right">Unit Price</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {viewingInvoice.line_items && viewingInvoice.line_items.map((item, index) => (
                    <TableRow key={index}>
                      <TableCell>{item.description}</TableCell>
                      <TableCell className="text-right">{item.quantity}</TableCell>
                      <TableCell className="text-right">{formatCurrency(item.unit_price_cents)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(item.total_cents)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            
            <div className="border-t border-slate-200 mt-4 pt-4">
              <div className="flex justify-end">
                <div className="w-48">
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-slate-600">Subtotal:</span>
                    <span className="font-medium">{formatCurrency(viewingInvoice.subtotal_cents)}</span>
                  </div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-slate-600">Tax:</span>
                    <span className="font-medium">{formatCurrency(viewingInvoice.tax_cents)}</span>
                  </div>
                  <div className="flex justify-between font-medium border-t border-slate-200 pt-1 mt-1">
                    <span>Total:</span>
                    <span>{formatCurrency(viewingInvoice.total_cents)}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      <DialogFooter>
        <Button 
          variant="outline" 
          onClick={() => setViewingInvoice(null)}
        >
          Close
        </Button>
        <Button 
          onClick={() => handleDownloadInvoice(viewingInvoice)}
        >
          <Download className="h-4 w-4 mr-2" />
          Download PDF
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);

export const CancelSubscriptionDialog = ({
  isCancelDialogOpen,
  setIsCancelDialogOpen,
  cancelSubscriptionLoading,
  cancelSubscription
}) => (
  <Dialog open={isCancelDialogOpen} onOpenChange={setIsCancelDialogOpen}>
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle className="font-serif">Cancel Subscription</DialogTitle>
        <DialogDescription>
          Are you sure you want to cancel your subscription? This action cannot be undone.
        </DialogDescription>
      </DialogHeader>
      <div className="py-4">
        <div className="border border-amber-200 bg-amber-50 rounded-lg p-4">
          <h3 className="font-serif text-lg font-medium text-slate-800 mb-2">Important Information</h3>
          <ul className="text-sm text-slate-600 space-y-2">
            <li className="flex items-start">
              <AlertCircle className="h-4 w-4 mr-2 text-amber-600 mt-0.5 flex-shrink-0" />
              Your subscription will be canceled immediately
            </li>
            <li className="flex items-start">
              <AlertCircle className="h-4 w-4 mr-2 text-amber-600 mt-0.5 flex-shrink-0" />
              You'll still have access to your current plan until the end of your billing period
            </li>
            <li className="flex items-start">
              <AlertCircle className="h-4 w-4 mr-2 text-amber-600 mt-0.5 flex-shrink-0" />
              You can resubscribe at any time
            </li>
          </ul>
        </div>
      </div>
      <DialogFooter>
        <Button 
          variant="outline" 
          onClick={() => setIsCancelDialogOpen(false)}
          disabled={cancelSubscriptionLoading}
        >
          Keep Subscription
        </Button>
        <Button 
          variant="destructive"
          onClick={async () => {
            await cancelSubscription();
            setIsCancelDialogOpen(false);
          }}
          disabled={cancelSubscriptionLoading}
        >
          {cancelSubscriptionLoading ? (
            <>
              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              Canceling...
            </>
          ) : (
            'Yes, Cancel Subscription'
          )}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
); 