import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/services/supabase-client';
import { toast } from 'sonner';

// Format currency helper
export const formatCurrency = (cents) => {
  if (!cents && cents !== 0) return 'N/A';
  
  return new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: 'ZAR',
    minimumFractionDigits: 2
  }).format(cents / 100);
};

// Format date helper
export const formatDate = (dateString) => {
  if (!dateString) return 'N/A';
  
  const date = new Date(dateString);
  return new Intl.DateTimeFormat('en-ZA', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  }).format(date);
};

// Format percentage with two decimal places
export const formatPercentage = (value) => {
  return `${Math.round(value)}%`;
};

// Custom hook for billing data
export const useBillingData = (activeFirm, user) => {
  const [loading, setLoading] = useState(true);
  const [plans, setPlans] = useState([]);
  const [currentPlan, setCurrentPlan] = useState(null);
  const [activeSubscription, setActiveSubscription] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [selectedPlanId, setSelectedPlanId] = useState(null);
  const [isPlanChangeDialogOpen, setIsPlanChangeDialogOpen] = useState(false);
  const [planChangeLoading, setPlanChangeLoading] = useState(false);
  const [cancelSubscriptionLoading, setCancelSubscriptionLoading] = useState(false);
  
  // Fetch all billing data on component mount
  useEffect(() => {
    if (activeFirm?.id) {
      fetchBillingData();
    }
  }, [activeFirm?.id]);
  
  // Fetch plans, active plan, transactions, invoices
  const fetchBillingData = async () => {
    setLoading(true);
    try {
      await Promise.all([
        fetchPlans(),
        fetchActiveSubscription(),
        fetchTransactions(),
        fetchInvoices(),
        fetchPaymentMethods()
      ]);
    } catch (error) {
      console.error('Error fetching billing data:', error);
      toast.error('Failed to load billing data');
    } finally {
      setLoading(false);
    }
  };
  
  // Fetch available plans
  const fetchPlans = async () => {
    const { data, error } = await supabase
      .from('plans')
      .select('*')
      .eq('is_active', true)
      .order('price_cents', { ascending: true });
      
    if (error) throw error;
    setPlans(data || []);
  };
  
  // Fetch active subscription and current plan
  const fetchActiveSubscription = async () => {
    if (!activeFirm?.id) return;
    
    try {
      // Get active or cancelled subscription (most recent one)
      const { data: subscriptionData, error: subscriptionError } = await supabase
        .from('subscriptions')
        .select('*, plan:plan_id(*)')
        .eq('firm_id', activeFirm.id)
        .in('status', ['active', 'canceled'])
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
      
      if (subscriptionError) {
        // If no subscription found (PGRST116), set to free tier
        if (subscriptionError.code === 'PGRST116') {
          // Get the free tier plan
          const { data: freePlan, error: freePlanError } = await supabase
            .from('plans')
            .select('*')
            .eq('name', 'Free')
            .single();
            
          if (freePlanError) {
            console.error('Error fetching free plan:', freePlanError);
            setCurrentPlan(null);
            setActiveSubscription(null);
            return;
          }
          
          setCurrentPlan(freePlan);
          setActiveSubscription(null);
          return;
        }
        
        // For other errors, log and reset
        console.error('Error fetching subscription:', subscriptionError);
        setCurrentPlan(null);
        setActiveSubscription(null);
        return;
      }
      
      if (subscriptionData) {
        setActiveSubscription(subscriptionData);
        setCurrentPlan(subscriptionData.plan);
      } else {
        // If no subscription data, set to free tier
        const { data: freePlan, error: freePlanError } = await supabase
          .from('plans')
          .select('*')
          .eq('name', 'Free')
          .single();
          
        if (freePlanError) {
          console.error('Error fetching free plan:', freePlanError);
          setCurrentPlan(null);
          setActiveSubscription(null);
          return;
        }
        
        setCurrentPlan(freePlan);
        setActiveSubscription(null);
      }
    } catch (error) {
      console.error('Error in fetchActiveSubscription:', error);
      setCurrentPlan(null);
      setActiveSubscription(null);
    }
  };
  
  // Fetch transaction history
  const fetchTransactions = async () => {
    if (!activeFirm?.id) return;
    
    const { data, error } = await supabase
      .from('transactions')
      .select('*')
      .eq('firm_id', activeFirm.id)
      .order('created_at', { ascending: false })
      .limit(50);
      
    if (error) throw error;
    setTransactions(data || []);
  };
  
  // Fetch invoice history
  const fetchInvoices = async () => {
    if (!activeFirm?.id) return;
    
    const { data, error } = await supabase
      .from('invoices')
      .select('*, plan:plan_id(*)')
      .eq('firm_id', activeFirm.id)
      .order('created_at', { ascending: false })
      .limit(50);
      
    if (error) throw error;
    setInvoices(data || []);
  };
  
  // Fetch payment methods
  const fetchPaymentMethods = async () => {
    if (!activeFirm?.id) return;
    
    const { data, error } = await supabase
      .from('payment_methods')
      .select('*')
      .eq('firm_id', activeFirm.id)
      .eq('is_active', true);
      
    if (error) throw error;
    
    // Transform payment method data
    const formattedMethods = (data || []).map(method => {
      const details = method.details || {};
      return {
        ...method,
        last4: details.last4 || '****',
        exp_month: details.exp_month || '**',
        exp_year: details.exp_year || '**',
        brand: details.card_type?.toLowerCase() || 'card'
      };
    });
    
    setPaymentMethods(formattedMethods);
  };
  
  // Handle plan change - Use redirect approach
  const handleChangePlan = async () => {
    if (!selectedPlanId || !activeFirm?.id) {
      toast.error('Unable to change plan: Missing plan or firm information');
      console.error('Missing data:', { selectedPlanId, firmId: activeFirm?.id });
      return;
    }
    
    if (!user?.email) {
      toast.error('Unable to change plan: User information required');
      console.error('Missing user email');
      return;
    }
    
    try {
      setPlanChangeLoading(true);
      console.log('Changing plan - sending request with:', { 
        planId: selectedPlanId, 
        firmId: activeFirm.id,
        email: user.email 
      });
      
      // Call the change-plan function to get payment details
      const { data, error } = await supabase.functions.invoke('change-plan', {
        body: {
          planId: selectedPlanId,
          firmId: activeFirm.id,
          email: user.email
        }
      });
      
      if (error) {
        console.error('Error from change-plan function:', error);
        throw new Error(error.message || 'Failed to change plan');
      }
      
      console.log('Response from change-plan function:', data);
      
      // Redirect to payment page if we have an authorization URL
      if (data?.authorization_url) {
        console.log('Redirecting to payment page:', data.authorization_url);
        
        // Save payment metadata in session storage for verification after redirect
        if (data.reference) {
          sessionStorage.setItem('payment_metadata', JSON.stringify({
            reference: data.reference,
            plan_id: selectedPlanId,
            firm_id: activeFirm.id,
            invoice_id: data.invoice_id
          }));
        }
        
        // Open in a new window or redirect based on preference
        window.location.href = data.authorization_url;
      } else {
        console.error('Invalid payment data received:', data);
        throw new Error('Invalid payment data');
      }
      
    } catch (error) {
      console.error('Error changing plan:', error);
      toast.error(error.message || 'Failed to change plan');
      setPlanChangeLoading(false);
      setIsPlanChangeDialogOpen(false);
    }
  };
  
  // Handle subscription cancellation
  const cancelSubscription = async () => {
    if (!activeFirm?.id) {
      toast.error('Unable to cancel subscription');
      return;
    }
    
    try {
      setCancelSubscriptionLoading(true);
      
      // Call the cancel_firm_subscriptions RPC function
      const { data, error } = await supabase.rpc(
        'cancel_firm_subscriptions',
        { firm_id_param: activeFirm.id }
      );
      
      if (error) throw error;
      
      if (data === true) {
        toast.success('Subscription successfully canceled');
        // Refresh data
        await fetchActiveSubscription();
      } else {
        toast.error('Failed to cancel subscription');
      }
    } catch (error) {
      console.error('Error canceling subscription:', error);
      toast.error(error.message || 'Failed to cancel subscription');
    } finally {
      setCancelSubscriptionLoading(false);
    }
  };
  
  // Download invoice
  const downloadInvoice = async (invoiceId, invoiceNumber) => {
    try {
      // This is a placeholder - implement actual PDF generation
      const response = await fetch(`/api/invoices/${invoiceId}/download`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        }
      });
      
      if (!response.ok) {
        throw new Error('Failed to download invoice');
      }
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = `invoice-${invoiceNumber}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error downloading invoice:', error);
      throw error;
    }
  };
  
  return {
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
    downloadInvoice,
    refreshData: fetchBillingData
  };
};

// Custom hook for usage data
export function useUsageData(activeFirm) {
  const [usageLoading, setUsageLoading] = useState(true);
  const [usageStats, setUsageStats] = useState(null);
  const [usageError, setUsageError] = useState(null);

  const fetchUsageData = useCallback(async () => {
    if (!activeFirm?.id) {
      setUsageStats(null);
      setUsageLoading(false);
      return;
    }
    
    setUsageLoading(true);
    setUsageError(null);
    
    try {
      const { data, error } = await supabase
        .rpc('check_firm_usage_limits', {
          input_firm_id: activeFirm.id
        });
      
      if (error) throw error;
      
      setUsageStats(data[0]);
    } catch (error) {
      console.error('Error fetching usage data:', error);
      setUsageError(error.message);
    } finally {
      setUsageLoading(false);
    }
  }, [activeFirm]);

  // Fetch usage data on mount and when activeFirm changes
  useEffect(() => {
    fetchUsageData();
  }, [fetchUsageData]);

  return {
    usageLoading,
    usageStats,
    usageError,
    fetchUsageData
  };
} 