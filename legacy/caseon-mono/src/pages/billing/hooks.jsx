import { useState, useEffect } from 'react';
import { supabase } from '@/services/supabase-client';
import { toast } from "sonner";

// Format amount to currency
export const formatCurrency = (amount, currency = 'ZAR') => {
  const cents = amount / 100;
  return new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2
  }).format(cents);
};

// Format date
export const formatDate = (dateString) => {
  if (!dateString) return 'N/A';
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
};

// Custom hook for fetching all billing data
export const useBillingData = (activeFirm, user) => {
  const [loading, setLoading] = useState(true);
  const [plans, setPlans] = useState([]);
  const [currentPlan, setCurrentPlan] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [selectedPlanId, setSelectedPlanId] = useState(null);
  const [isPlanChangeDialogOpen, setIsPlanChangeDialogOpen] = useState(false);
  const [planChangeLoading, setPlanChangeLoading] = useState(false);
  const [paymentMetadata, setPaymentMetadata] = useState(null);

  useEffect(() => {
    if (activeFirm) {
      fetchBillingData();
    }
  }, [activeFirm]);

  const fetchBillingData = async () => {
    if (!activeFirm) return;
    
    setLoading(true);
    try {
      // Fetch all billing data in parallel
      const [plansData, currentPlanData, transactionsData, invoicesData, paymentMethodsData] = await Promise.all([
        fetchPlans(),
        fetchCurrentPlan(),
        fetchTransactions(),
        fetchInvoices(),
        fetchPaymentMethods()
      ]);
      
      setPlans(plansData || []);
      setCurrentPlan(currentPlanData);
      setTransactions(transactionsData || []);
      setInvoices(invoicesData || []);
      setPaymentMethods(paymentMethodsData || []);
      
      // Set the current plan as selected by default
      if (currentPlanData) {
        setSelectedPlanId(currentPlanData.id);
      } else if (plansData && plansData.length > 0) {
        setSelectedPlanId(plansData[0].id);
      }
    } catch (error) {
      console.error('Error fetching billing data:', error);
      toast.error('Failed to load billing information');
    } finally {
      setLoading(false);
    }
  };

  const fetchPlans = async () => {
    const { data, error } = await supabase
      .from('plans')
      .select('*')
      .eq('is_active', true)
      .order('price_cents', { ascending: true });
    
    if (error) throw error;
    return data;
  };

  const fetchCurrentPlan = async () => {
    const { data, error } = await supabase
      .from('invoices')
      .select('*, plan:plan_id(*)')
      .eq('firm_id', activeFirm.id)
      .eq('status', 'paid')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    
    if (error && error.code !== 'PGRST116') {
      // PGRST116 is "no rows returned" which is expected if no subscription
      throw error;
    }
    
    return data?.plan || null;
  };

  const fetchTransactions = async () => {
    const { data, error } = await supabase
      .from('transactions')
      .select('*')
      .eq('firm_id', activeFirm.id)
      .order('created_at', { ascending: false })
      .limit(10);
    
    if (error) throw error;
    return data;
  };

  const fetchInvoices = async () => {
    const { data, error } = await supabase
      .from('invoices')
      .select('*, plan:plan_id(*)')
      .eq('firm_id', activeFirm.id)
      .order('created_at', { ascending: false })
      .limit(10);
    
    if (error) throw error;
    return data;
  };

  const fetchPaymentMethods = async () => {
    // Placeholder for actual payment method fetching
    // In a real implementation, this would fetch from your payment processor
    return [
      {
        id: 'pm_1',
        type: 'card',
        brand: 'visa',
        last4: '4242',
        exp_month: 12,
        exp_year: 2025,
        is_default: true
      }
    ];
  };

  const handleChangePlan = async () => {
    if (!selectedPlanId || !activeFirm || !user) {
      toast.error('Missing required information');
      return;
    }

    setPlanChangeLoading(true);
    try {
      // Get selected plan
      const selectedPlan = plans.find(plan => plan.id === selectedPlanId);
      if (!selectedPlan) {
        throw new Error('Selected plan not found');
      }

      // Call Supabase Edge Function for plan change
      const { data, error } = await supabase.functions.invoke('change-plan', {
        body: {
          planId: selectedPlanId,
          firmId: activeFirm.id,
          email: user.email
        }
      });

      if (error) {
        throw new Error(error.message || 'Failed to change plan');
      }

      // Redirect to Paystack's payment page
      if (data.authorization_url) {
        // Save payment metadata in session storage for verification after redirect
        sessionStorage.setItem('payment_metadata', JSON.stringify({
          reference: data.reference,
          transaction_reference: data.transaction_reference,
          plan_id: selectedPlanId,
          firm_id: activeFirm.id,
          invoice_id: data.invoice_id
        }));

        window.location.href = data.authorization_url;
      } else {
        throw new Error('Failed to initialize payment');
      }
      
      // Close dialog as we're redirecting away
      setIsPlanChangeDialogOpen(false);
      
    } catch (error) {
      console.error('Error initiating payment:', error);
      toast.error(error.message || 'Failed to initiate payment');
      setPlanChangeLoading(false);
    }
  };

  const verifyPayment = async (reference) => {
    try {
      // Call the verify-payment function using Supabase client
      const { data, error } = await supabase.functions.invoke('verify-payment', {
        body: {
          reference,
          firmId: activeFirm.id
        }
      });
      
      if (error) {
        throw new Error(error.message || 'Payment verification failed');
      }
      
      return data;
    } catch (error) {
      console.error('Error verifying payment:', error);
      throw error;
    } finally {
      setPlanChangeLoading(false);
    }
  };

  const downloadInvoice = async (invoiceId, invoiceNumber) => {
    if (!invoiceId || !activeFirm) {
      toast.error('Unable to download invoice');
      return;
    }

    try {
      // Call the invoice generation edge function
      const { data, error } = await supabase.functions.invoke('generate-invoice-pdf', {
        body: {
          invoiceId,
          firmId: activeFirm.id
        }
      });

      if (error) {
        throw new Error(error.message || 'Failed to generate invoice');
      }

      if (!data || !data.pdfBase64) {
        throw new Error('No PDF data received');
      }

      // Convert base64 to blob
      const byteCharacters = atob(data.pdfBase64);
      const byteArrays = [];
      for (let i = 0; i < byteCharacters.length; i++) {
        byteArrays.push(byteCharacters.charCodeAt(i));
      }
      const byteArray = new Uint8Array(byteArrays);
      const blob = new Blob([byteArray], { type: 'application/pdf' });

      // Create download link
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `Invoice_${invoiceNumber}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      toast.success('Invoice downloaded successfully');
    } catch (error) {
      console.error('Error downloading invoice:', error);
      toast.error(error.message || 'Failed to download invoice');
      throw error;
    }
  };

  return {
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
    setPlanChangeLoading,
    handleChangePlan,
    fetchBillingData,
    downloadInvoice
  };
};
