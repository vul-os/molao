import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Shield, Check, RefreshCw, AlertCircle, Newspaper, Scale } from "lucide-react";
import { formatCurrency, formatDate } from './hooks';

// Custom plan feature component - make it more compact
export const PlanFeature = ({ included, feature }) => (
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

export const AvailablePlans = ({ plans, currentPlan, setSelectedPlanId, setIsPlanChangeDialogOpen }) => (
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
);

export const CurrentPlanCard = ({ 
  currentPlan, 
  activeSubscription, 
  cancelSubscriptionLoading, 
  setIsCancelDialogOpen 
}) => (
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
            {activeSubscription?.status === 'canceled' ? (
              <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <p className="text-sm text-amber-800">
                  Your subscription has been cancelled and will end on{' '}
                  <span className="font-medium">
                    {formatDate(activeSubscription.next_billing_date)}
                  </span>
                </p>
              </div>
            ) : (
              <Button 
                variant="outline" 
                className="text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
                onClick={() => setIsCancelDialogOpen(true)}
                disabled={cancelSubscriptionLoading}
              >
                {cancelSubscriptionLoading ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    Canceling...
                  </>
                ) : (
                  'Cancel Subscription'
                )}
              </Button>
            )}
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
);

// Custom GavelIcon component since Lucide doesn't have one
export const GavelIcon = ({ className, size = 24 }) => (
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