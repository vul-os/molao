import { useState } from 'react';
import { useAuth } from '@/context/auth-context';
import { supabase } from '@/services/supabase-client';
import { paystack_public_key } from '@/services/paystack';
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardFooter, 
  CardHeader, 
  CardTitle 
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { 
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { motion } from "framer-motion";
import {
  CreditCard,
  FileText,
  Scale,
  Receipt,
  Calendar,
  Shield,
  Check,
  ArrowRight,
  Download,
  ChevronRight,
  RefreshCw,
  AlertCircle,
  Newspaper
} from "lucide-react";

// Import hooks and utilities
import { formatCurrency, formatDate, useBillingData } from './hooks';
import UsageCharts from './usage-charts';
import { 
  AvailablePlans, 
  CurrentPlanCard, 
  GavelIcon,
  PlanFeature
} from './plan-components';
import {
  ChangePlanDialog,
  ViewInvoiceDialog,
  CancelSubscriptionDialog
} from './billing-dialog';
import { getCardLogo } from './card-logos';

export default function BillingPage() {
  const { activeFirm, user } = useAuth();
  const [activeTab, setActiveTab] = useState("billing");
  const [viewingInvoice, setViewingInvoice] = useState(null);
  const [isCancelDialogOpen, setIsCancelDialogOpen] = useState(false);
  
  // Use our custom hook to handle all billing data and logic
  const {
    loading,
    plans,
    currentPlan,
    activeSubscription,
    transactions,
    invoices,
    paymentMethods,
    selectedPlanId,
    setSelectedPlanId,
    isPlanChangeDialogOpen,
    setIsPlanChangeDialogOpen,
    planChangeLoading,
    cancelSubscriptionLoading,
    handleChangePlan,
    cancelSubscription,
    downloadInvoice
  } = useBillingData(activeFirm, user);

  // Handle invoice download
  const handleDownloadInvoice = async (invoice) => {
    try {
      await downloadInvoice(invoice.id, invoice.invoice_number);
    } catch (error) {
      toast.error("Failed to download invoice");
      console.error("Download error:", error);
    }
  };

  // Handle view invoice
  const handleViewInvoice = (invoice) => {
    setViewingInvoice(invoice);
  };

  // Loading state
  if (loading) {
    return (
      <div className="container mx-auto py-10 px-4 md:px-6">
        <div className="flex justify-between items-center mb-8">
          <div className="h-8 w-44 bg-gray-200 rounded-md animate-pulse"></div>
          <div className="h-10 w-32 bg-gray-200 rounded-md animate-pulse"></div>
        </div>
        <div className="space-y-8">
          <div className="bg-white rounded-lg border border-gray-200 p-6 animate-pulse">
            <div className="h-7 w-40 bg-gray-300 rounded mb-6"></div>
            <div className="grid gap-6 md:grid-cols-3">
              <div className="h-64 bg-gray-100 rounded-lg border border-gray-200"></div>
              <div className="h-64 bg-gray-100 rounded-lg border border-gray-200"></div>
              <div className="h-64 bg-gray-100 rounded-lg border border-gray-200"></div>
            </div>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-6 animate-pulse">
            <div className="h-7 w-48 bg-gray-300 rounded mb-6"></div>
            <div className="space-y-4">
              <div className="h-12 bg-gray-100 rounded"></div>
              <div className="h-12 bg-gray-100 rounded"></div>
              <div className="h-12 bg-gray-100 rounded"></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-10 px-4 md:px-6">
      <div className="flex flex-col space-y-8">
        {/* Header Section */}
        <header className="border-b border-slate-200 pb-6">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-serif font-medium text-slate-800 flex items-center">
                <GavelIcon className="h-8 w-8 mr-3 text-amber-600" />
                Billing & Subscription
              </h1>
              <p className="text-slate-500 mt-1">
                Manage your subscription, payment methods, and billing history
              </p>
            </div>
            {currentPlan && (
              <Badge variant="outline" className="text-base py-1.5 px-3 bg-amber-50 text-amber-800 border-amber-200">
                <Scale className="h-4 w-4 mr-2" />
                {currentPlan.name}
              </Badge>
            )}
          </div>
        </header>

        {/* Main Content */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="w-full h-[72px] bg-white shadow-sm border border-slate-200 rounded-lg grid grid-cols-3">
            {/* Billing Tab */}
            <TabsTrigger 
              value="billing" 
              className="relative h-full flex flex-col items-center justify-center 
                         border-r border-slate-200 
                         text-slate-700 hover:bg-slate-50
                         data-[state=active]:bg-amber-50 data-[state=active]:text-amber-700 
                         transition-all"
            >
              <div className="flex flex-col items-center sm:flex-row sm:items-center sm:justify-center gap-2">
                <CreditCard className="h-5 w-5 text-slate-500 data-[state=active]:text-amber-600" />
                <span className="text-xs font-medium text-center sm:text-sm">
                  Subscription
                </span>
              </div>
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-amber-500 opacity-0 data-[state=active]:opacity-100 transition-opacity"></div>
            </TabsTrigger>

            {/* Payment Tab */}
            <TabsTrigger
              value="payment"
              className="relative h-full flex flex-col items-center justify-center
              border-r border-slate-200
              text-slate-700 hover:bg-slate-50
              data-[state=active]:bg-amber-50 data-[state=active]:text-amber-700
              transition-all"
            >
              <div className="flex flex-col items-center sm:flex-row sm:items-center sm:justify-center gap-2">
                <Receipt className="h-5 w-5 text-slate-500 data-[state=active]:text-amber-600" />
                <span className="text-xs font-medium text-center sm:text-sm">
                  Payment Methods
                </span>
              </div>
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-amber-500 opacity-0 data-[state=active]:opacity-100 transition-opacity"></div>
            </TabsTrigger>

            {/* History Tab */}
            <TabsTrigger 
              value="history" 
              className="relative h-full flex flex-col items-center justify-center 
                         text-slate-700 hover:bg-slate-50
                         data-[state=active]:bg-amber-50 data-[state=active]:text-amber-700 
                         transition-all"
            >
              <div className="flex flex-col items-center sm:flex-row sm:items-center sm:justify-center gap-2">
                <FileText className="h-5 w-5 text-slate-500 data-[state=active]:text-amber-600" />
                <span className="text-xs font-medium text-center sm:text-sm">
                  Billing History
                </span>
              </div>
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-amber-500 opacity-0 data-[state=active]:opacity-100 transition-opacity"></div>
            </TabsTrigger>
          </TabsList>

          <div className="mt-8 space-y-8">
            <TabsContent value="billing">
              {/* Available Plans - Moved to top for visibility */}
              <AvailablePlans 
                plans={plans} 
                currentPlan={currentPlan} 
                setSelectedPlanId={setSelectedPlanId} 
                setIsPlanChangeDialogOpen={setIsPlanChangeDialogOpen} 
              />

              {/* Current Plan Card - Moved after plans */}
              <CurrentPlanCard 
                currentPlan={currentPlan}
                activeSubscription={activeSubscription}
                cancelSubscriptionLoading={cancelSubscriptionLoading}
                setIsCancelDialogOpen={setIsCancelDialogOpen}
              />
              
              {/* Usage Statistics - Moved to billing tab */}
              <Card className="shadow-sm mt-8">
                <CardHeader className="bg-slate-50 border-b border-slate-100">
                  <CardTitle className="text-xl font-serif flex items-center">
                    <Scale className="h-5 w-5 mr-2 text-slate-600" />
                    Usage Statistics
                  </CardTitle>
                  <CardDescription>
                    Track your current usage and limits
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-6">
                  <UsageCharts />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="payment">
              <Card className="shadow-sm">
                <CardHeader className="bg-slate-50 border-b border-slate-100">
                  <CardTitle className="text-xl font-serif flex items-center">
                    <CreditCard className="h-5 w-5 mr-2 text-slate-600" />
                    Payment Methods
                  </CardTitle>
                  <CardDescription>
                    Manage your payment methods and billing preferences
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-6">
                  {paymentMethods.length > 0 ? (
                    <div className="space-y-4">
                      {paymentMethods.map((method) => (
                        <div 
                          key={method.id}
                          className="flex items-center justify-between p-4 border border-slate-200 rounded-lg hover:border-slate-300 transition-colors"
                        >
                          <div className="flex items-center gap-4">
                            <div className="w-12 h-8 bg-slate-100 rounded border border-slate-200 flex items-center justify-center">
                              {(() => {
                                const CardLogo = getCardLogo(method.details.card_type.trim());
                                return <CardLogo className="w-10 h-6" />;
                              })()}
                            </div>
                            <div>
                              <p className="font-medium text-slate-800">
                                {method.details.card_type.trim().charAt(0).toUpperCase() + method.details.card_type.trim().slice(1)} •••• {method.details.last4}
                              </p>
                              <div className="flex items-center text-sm text-slate-500">
                                <span>Expires {method.details.exp_month}/{method.details.exp_year}</span>
                                {method.is_default && (
                                  <span className="ml-2">
                                    <Badge variant="outline" className="py-0 h-5 text-xs bg-emerald-50 text-emerald-700 border-emerald-200">
                                      Default
                                    </Badge>
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <Button variant="outline" size="sm" className="text-red-600 hover:text-red-700 hover:bg-red-50">Remove</Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8">
                      <div className="mx-auto w-16 h-16 bg-slate-100 border border-slate-200 rounded-full flex items-center justify-center mb-4">
                        <CreditCard className="h-8 w-8 text-slate-400" />
                      </div>
                      <h3 className="text-lg font-serif font-medium text-slate-800">No Payment Methods</h3>
                      <p className="mt-1 text-sm text-slate-500 max-w-md mx-auto">
                        You haven't added any payment methods yet
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="history">
              {/* Invoices */}
              <Card className="shadow-sm">
                <CardHeader className="bg-slate-50 border-b border-slate-100">
                  <CardTitle className="text-xl font-serif flex items-center">
                    <Receipt className="h-5 w-5 mr-2 text-slate-600" />
                    Invoices
                  </CardTitle>
                  <CardDescription>
                    View and download your invoice history
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-6">
                  {invoices.length > 0 ? (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Invoice</TableHead>
                          <TableHead>Date</TableHead>
                          <TableHead>Plan</TableHead>
                          <TableHead>Amount</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {invoices.map((invoice) => (
                          <TableRow key={invoice.id}>
                            <TableCell className="font-medium">{invoice.invoice_number}</TableCell>
                            <TableCell>{formatDate(invoice.created_at)}</TableCell>
                            <TableCell>{invoice.plan?.name || 'N/A'}</TableCell>
                            <TableCell>{formatCurrency(invoice.total_cents)}</TableCell>
                            <TableCell>
                              <Badge 
                                variant="outline" 
                                className={`
                                  ${invoice.status === 'paid' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : ''}
                                  ${invoice.status === 'pending' ? 'bg-amber-50 text-amber-700 border-amber-200' : ''}
                                  ${invoice.status === 'draft' ? 'bg-slate-50 text-slate-700 border-slate-200' : ''}
                                  ${invoice.status === 'failed' ? 'bg-red-50 text-red-700 border-red-200' : ''}
                                `}
                              >
                                {invoice.status.charAt(0).toUpperCase() + invoice.status.slice(1)}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-2">
                                <Button 
                                  variant="outline" 
                                  size="sm"
                                  onClick={() => handleViewInvoice(invoice)}
                                >
                                  <FileText className="h-4 w-4 mr-2" />
                                  View
                                </Button>
                                <Button 
                                  variant="outline" 
                                  size="sm"
                                  onClick={() => handleDownloadInvoice(invoice)}
                                >
                                  <Download className="h-4 w-4 mr-2" />
                                  Download
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  ) : (
                    <div className="text-center py-8">
                      <div className="mx-auto w-16 h-16 bg-slate-100 border border-slate-200 rounded-full flex items-center justify-center mb-4">
                        <Receipt className="h-8 w-8 text-slate-400" />
                      </div>
                      <h3 className="text-lg font-serif font-medium text-slate-800">No Invoices</h3>
                      <p className="mt-1 text-sm text-slate-500 max-w-md mx-auto">
                        You don't have any invoices yet
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Transactions */}
              <Card className="shadow-sm">
                <CardHeader className="bg-slate-50 border-b border-slate-100">
                  <CardTitle className="text-xl font-serif flex items-center">
                    <FileText className="h-5 w-5 mr-2 text-slate-600" />
                    Transaction History
                  </CardTitle>
                  <CardDescription>
                    Your recent payment activity
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-6">
                  {transactions.length > 0 ? (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Reference</TableHead>
                          <TableHead>Date</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead>Amount</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {transactions.map((transaction) => (
                          <TableRow key={transaction.id}>
                            <TableCell className="font-medium">{transaction.reference}</TableCell>
                            <TableCell>{formatDate(transaction.created_at)}</TableCell>
                            <TableCell className="capitalize">{transaction.type}</TableCell>
                            <TableCell>{formatCurrency(transaction.amount_cents)}</TableCell>
                            <TableCell>
                              <Badge 
                                variant="outline" 
                                className={`
                                  ${transaction.status === 'success' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : ''}
                                  ${transaction.status === 'pending' ? 'bg-amber-50 text-amber-700 border-amber-200' : ''}
                                  ${transaction.status === 'failed' ? 'bg-red-50 text-red-700 border-red-200' : ''}
                                `}
                              >
                                {transaction.status.charAt(0).toUpperCase() + transaction.status.slice(1)}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  ) : (
                    <div className="text-center py-8">
                      <div className="mx-auto w-16 h-16 bg-slate-100 border border-slate-200 rounded-full flex items-center justify-center mb-4">
                        <FileText className="h-8 w-8 text-slate-400" />
                      </div>
                      <h3 className="text-lg font-serif font-medium text-slate-800">No Transactions</h3>
                      <p className="mt-1 text-sm text-slate-500 max-w-md mx-auto">
                        You don't have any transaction history yet
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </div>
        </Tabs>

        {/* Dialogs */}
        <ChangePlanDialog 
          isPlanChangeDialogOpen={isPlanChangeDialogOpen}
          setIsPlanChangeDialogOpen={setIsPlanChangeDialogOpen}
          selectedPlanId={selectedPlanId}
          plans={plans}
          planChangeLoading={planChangeLoading}
          handleChangePlan={handleChangePlan}
        />

        <ViewInvoiceDialog 
          viewingInvoice={viewingInvoice}
          setViewingInvoice={setViewingInvoice}
          handleDownloadInvoice={handleDownloadInvoice}
        />

        <CancelSubscriptionDialog 
          isCancelDialogOpen={isCancelDialogOpen}
          setIsCancelDialogOpen={setIsCancelDialogOpen}
          cancelSubscriptionLoading={cancelSubscriptionLoading}
          cancelSubscription={cancelSubscription}
        />
      </div>
    </div>
  );
} 