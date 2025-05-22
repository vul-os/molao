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

// Custom GavelIcon component since Lucide doesn't have one
const GavelIcon = ({ className, size = 24 }) => (
  <svg 
    xmlns="http://www.w3.org/2000/svg" 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth="2" 
    strokeLinecap="round" 
    strokeLinejoin="round" 
    className={className}
  >
    <path d="M14 13L3 2" />
    <path d="M11 16l-1 1" />
    <path d="M20 16l1 1" />
    <path d="M14 6l7 7" />
    <path d="M14 6l-1-1 7-4 1 1-4 7-1-1" />
    <rect x="14" y="13" width="7" height="7" rx="1" />
  </svg>
);

// Custom plan feature component - make it more compact
const PlanFeature = ({ included, feature }) => (
  <div className="flex items-center gap-2 py-1.5">
    {included ? (
      <Check className="h-4 w-4 text-emerald-500 flex-shrink-0" />
    ) : (
      <div className="h-4 w-4 border border-slate-200 rounded-full flex-shrink-0" />
    )}
    <span 
      className="text-sm text-slate-600"
      dangerouslySetInnerHTML={{ 
        __html: feature.replace(/<em>(.*?)<\/em>/g, '<em class="italic font-medium">$1</em>') 
      }}
    />
  </div>
);

export default function BillingPage() {
  const { activeFirm, user } = useAuth();
  const [activeTab, setActiveTab] = useState("billing");
  const [viewingInvoice, setViewingInvoice] = useState(null);
  
  // Use our custom hook to handle all billing data and logic
  const {
    loading,
    plans,
    currentPlan,
    transactions,
    invoices,
    paymentMethods,
    selectedPlanId,
    setSelectedPlanId,
    isPlanChangeDialogOpen,
    setIsPlanChangeDialogOpen,
    planChangeLoading,
    handleChangePlan,
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
          <TabsList className="w-full max-w-md mb-8">
            <TabsTrigger value="billing" className="flex-1">
              <CreditCard className="h-4 w-4 mr-2" />
              Subscription
            </TabsTrigger>
            <TabsTrigger value="payment" className="flex-1">
              <Receipt className="h-4 w-4 mr-2" />
              Payment Methods
            </TabsTrigger>
            <TabsTrigger value="history" className="flex-1">
              <FileText className="h-4 w-4 mr-2" />
              Billing History
            </TabsTrigger>
          </TabsList>

          <TabsContent value="billing" className="space-y-8">
            {/* Available Plans - Moved to top for visibility */}
            <div id="available-plans">
              <h2 className="text-xl font-serif font-medium text-slate-800 mb-6 flex items-center">
                <Newspaper className="h-5 w-5 mr-2 text-slate-600" />
                Available Plans
              </h2>
              <div className="grid gap-6 md:grid-cols-3">
                {plans.map((plan) => (
                  <motion.div
                    key={plan.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3 }}
                    whileHover={{ 
                      y: -5, 
                      transition: { duration: 0.2 } 
                    }}
                    className={`group relative overflow-hidden rounded-xl border ${
                      currentPlan?.id === plan.id 
                        ? 'border-amber-300 bg-gradient-to-br from-amber-50 to-amber-100 shadow-lg' 
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    } transition-all duration-200 shadow-sm hover:shadow-md`}
                  >
                    {currentPlan?.id === plan.id && (
                      <div className="absolute -right-12 top-7 bg-amber-500 text-white text-xs font-bold py-1.5 px-12 transform rotate-45 shadow-sm">
                        Current Plan
                      </div>
                    )}
                    <div className="p-6">
                      <h3 className="font-serif text-xl font-medium text-slate-800 mb-1">{plan.name}</h3>
                      <div className="mt-2 mb-3">
                        <div className="flex items-baseline">
                          <span className="text-3xl font-bold text-slate-800">{formatCurrency(plan.price_cents)}</span>
                          <span className="text-slate-500 ml-2 text-sm font-medium">/month</span>
                        </div>
                        <div className="h-0.5 w-16 bg-amber-200 mt-2 mb-2"></div>
                      </div>
                      <p className="text-slate-600 text-sm mb-3">{plan.description}</p>
                      <Separator className="my-3 bg-slate-200" />
                      <div className="space-y-0.5 mb-5">
                        {plan.features && Array.isArray(plan.features) ? (
                          plan.features.map((feature, index) => (
                            <PlanFeature 
                              key={index} 
                              included={true} 
                              feature={feature} 
                            />
                          ))
                        ) : (
                          <div className="text-center py-2 text-slate-500 text-sm italic">
                            No features specified
                          </div>
                        )}
                      </div>
                      <Button 
                        className={`w-full transition-all duration-300 rounded-lg ${
                          currentPlan?.id === plan.id 
                            ? 'bg-amber-600 hover:bg-amber-700 shadow-sm hover:shadow' 
                            : 'bg-slate-800 hover:bg-slate-700 shadow-sm hover:shadow'
                        }`}
                        disabled={currentPlan?.id === plan.id}
                        onClick={() => {
                          setSelectedPlanId(plan.id);
                          setIsPlanChangeDialogOpen(true);
                        }}
                      >
                        {currentPlan?.id === plan.id 
                          ? 'Current Plan' 
                          : 'Select Plan'}
                      </Button>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>

            {/* Current Plan Card - Moved after plans */}
            <Card className="shadow-sm rounded-xl overflow-hidden">
              <CardHeader className="bg-slate-50 border-b border-slate-100">
                <CardTitle className="text-xl font-serif flex items-center">
                  <Shield className="h-5 w-5 mr-2 text-amber-600" />
                  Your Current Plan
                </CardTitle>
                <CardDescription>
                  {currentPlan 
                    ? `You are currently on the ${currentPlan.name} plan.` 
                    : "You don't have an active subscription."}
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-6">
                {currentPlan ? (
                  <div className="flex flex-col md:flex-row gap-6">
                    <div className="flex-1">
                      <h3 className="font-serif text-lg font-medium text-slate-800">{currentPlan.name}</h3>
                      <div className="mt-1 mb-4">
                        <span className="text-2xl font-bold text-slate-800">{formatCurrency(currentPlan.price_cents)}</span>
                        <span className="text-slate-500 ml-1 text-sm">/month</span>
                      </div>
                      <p className="text-slate-600 text-sm mb-4">{currentPlan.description}</p>
                    </div>
                    <Separator orientation="vertical" className="hidden md:block" />
                    <div className="flex-1">
                      <h4 className="font-medium text-slate-800 mb-2">Plan Features</h4>
                      <div className="space-y-0.5">
                        {currentPlan.features && Array.isArray(currentPlan.features) ? (
                          currentPlan.features.map((feature, index) => (
                            <PlanFeature 
                              key={index} 
                              included={true} 
                              feature={feature} 
                            />
                          ))
                        ) : (
                          <div className="text-center py-2 text-slate-500 text-sm italic">
                            No features specified
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <div className="mx-auto w-16 h-16 bg-slate-100 border border-slate-200 rounded-full flex items-center justify-center mb-4">
                      <AlertCircle className="h-8 w-8 text-slate-400" />
                    </div>
                    <h3 className="text-lg font-serif font-medium text-slate-800">No Active Subscription</h3>
                    <p className="mt-1 text-sm text-slate-500 max-w-md mx-auto">
                      Select a plan above to get started with premium features
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="payment" className="space-y-8">
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
                            {method.brand === 'visa' && (
                              <span className="font-bold text-blue-600">VISA</span>
                            )}
                            {method.brand === 'mastercard' && (
                              <span className="font-bold text-red-600">MC</span>
                            )}
                          </div>
                          <div>
                            <p className="font-medium text-slate-800">
                              {method.brand.charAt(0).toUpperCase() + method.brand.slice(1)} •••• {method.last4}
                            </p>
                            <div className="flex items-center text-sm text-slate-500">
                              <span>Expires {method.exp_month}/{method.exp_year}</span>
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
                          <Button variant="outline" size="sm">Edit</Button>
                          <Button variant="outline" size="sm" className="text-red-600 hover:text-red-700 hover:bg-red-50">Remove</Button>
                        </div>
                      </div>
                    ))}
                    <Button variant="outline" className="mt-4">
                      <CreditCard className="h-4 w-4 mr-2" />
                      Add Payment Method
                    </Button>
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
                    <Button className="mt-4 bg-slate-800 hover:bg-slate-700">
                      <CreditCard className="h-4 w-4 mr-2" />
                      Add Payment Method
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="history" className="space-y-8">
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
        </Tabs>

        {/* Change Plan Dialog */}
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

        {/* View Invoice Dialog */}
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
      </div>
    </div>
  );
} 