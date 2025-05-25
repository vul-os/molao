import React from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, Zap, BookOpen, Sparkles, Lock, CreditCard } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const PricingFeature = ({ children }) => (
  <div className="flex items-center space-x-2 py-1.5">
    <CheckCircle2 className="h-4 w-4 text-emerald-500 flex-shrink-0" />
    <span className="text-sm text-slate-600">{children}</span>
  </div>
);

const Pricing = () => {
  const navigate = useNavigate();

  return (
    <section className="py-6 pt-2 md:pt-6 px-4 md:px-8 bg-white">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-6">
          <Badge 
            variant="outline" 
            className="mb-2 px-3 py-1 border-indigo-200 text-indigo-700 bg-indigo-50 text-sm font-medium"
          >
            Simple Pricing
          </Badge>
          <h2 className="text-3xl md:text-4xl font-serif font-bold text-slate-900">Choose Your Plan</h2>
          <p className="mt-2 text-lg text-slate-600 max-w-2xl mx-auto">
            Select the perfect plan for your legal research needs.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative">
          {/* Decorative element */}
          <div className="absolute top-1/3 left-0 right-0 h-1/3 bg-gradient-to-r from-indigo-50 via-slate-50 to-indigo-50 -z-10 transform -skew-y-1"></div>
          
          {/* Paralegal Plan */}
          <Card className={cn(
            "border border-slate-200 transition-all duration-300 hover:shadow-lg hover:-translate-y-1 overflow-hidden bg-white",
          )}>
            <CardHeader className="pb-4">
              <div className="flex items-center space-x-2 mb-2">
                <BookOpen className="h-5 w-5 text-slate-500" />
                <CardTitle className="text-2xl font-serif font-bold text-slate-800">Paralegal Plan</CardTitle>
              </div>
              <CardDescription className="text-slate-600 mb-4">Basic legal support with essential features</CardDescription>
              <div className="flex items-baseline">
                <span className="text-4xl font-bold text-slate-900">Free</span>
                <span className="text-sm text-slate-500 ml-1">forever</span>
              </div>
            </CardHeader>
            <CardContent className="border-t border-slate-100 pb-6">
              <div className="pt-4 space-y-2">
                <PricingFeature>Limited usage</PricingFeature>
                <PricingFeature>Basic search tools</PricingFeature>
                <PricingFeature>Online documentation</PricingFeature>
              </div>
            </CardContent>
            <CardFooter className="pt-2 pb-6">
              <Button 
                variant="outline" 
                className="w-full rounded-lg border-slate-300 hover:border-slate-400 hover:bg-slate-50 text-slate-700 font-medium py-6" 
                onClick={() => navigate('/signup')}
              >
                Start for Free
              </Button>
            </CardFooter>
          </Card>

          {/* Associate Plan */}
          <Card className={cn(
            "border-2 border-indigo-200 transition-all duration-300 hover:shadow-xl hover:-translate-y-2 overflow-hidden bg-white relative",
            "shadow-lg z-10"
          )}>
            {/* Highlight ribbon */}
            <div className="absolute top-0 right-0">
              <div className="bg-indigo-600 text-white text-xs font-semibold px-3 py-1 rounded-bl-lg shadow-sm">
                POPULAR
              </div>
            </div>
            <div className="absolute top-0 inset-x-0 h-1.5 bg-indigo-600"></div>
            <CardHeader className="pb-4">
              <div className="flex items-center space-x-2 mb-2">
                <Zap className="h-5 w-5 text-indigo-600" />
                <CardTitle className="text-2xl font-serif font-bold text-slate-800">Associate Plan</CardTitle>
              </div>
              <CardDescription className="text-slate-600 mb-4">Enhanced legal practice management</CardDescription>
              <div className="flex items-baseline">
                <span className="text-4xl font-bold text-slate-900">R100</span>
                <span className="text-sm text-slate-500 ml-1">/month</span>
              </div>
            </CardHeader>
            <CardContent className="border-t border-slate-100 pb-6">
              <div className="pt-4 space-y-2">
                <PricingFeature>Core research capabilities</PricingFeature>
                <PricingFeature>Standard support</PricingFeature>
                <PricingFeature>Basic case insights</PricingFeature>
                <PricingFeature>Standard search tools</PricingFeature>
              </div>
            </CardContent>
            <CardFooter className="pt-2 pb-6">
              <Button 
                className="w-full rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-6" 
                onClick={() => navigate('/signup')}
              >
                Get Started
              </Button>
            </CardFooter>
          </Card>

          {/* Partner Plan */}
          <Card className={cn(
            "border border-slate-200 transition-all duration-300 hover:shadow-lg hover:-translate-y-1 overflow-hidden bg-white",
          )}>
            <CardHeader className="pb-4">
              <div className="flex items-center space-x-2 mb-2">
                <Sparkles className="h-5 w-5 text-amber-500" />
                <CardTitle className="text-2xl font-serif font-bold text-slate-800">Partner Plan</CardTitle>
              </div>
              <CardDescription className="text-slate-600 mb-4">Premium legal practice solution</CardDescription>
              <div className="flex items-baseline">
                <span className="text-4xl font-bold text-slate-900">R345</span>
                <span className="text-sm text-slate-500 ml-1">/month</span>
              </div>
            </CardHeader>
            <CardContent className="border-t border-slate-100 pb-6">
              <div className="pt-4 space-y-2">
                <PricingFeature>Unlimited usage</PricingFeature>
                <PricingFeature>Priority dedicated support</PricingFeature>
                <PricingFeature>Billing access & management</PricingFeature>
                <PricingFeature>Advanced team controls</PricingFeature>
                <PricingFeature>Premium research tools</PricingFeature>
              </div>
            </CardContent>
            <CardFooter className="pt-2 pb-6">
              <Button 
                variant="outline" 
                className="w-full rounded-lg border-slate-800 text-slate-800 hover:bg-slate-50 font-medium py-6" 
                onClick={() => navigate('/signup')}
              >
                Upgrade to Partner
              </Button>
            </CardFooter>
          </Card>
        </div>
        
        {/* Additional information */}
        <div className="mt-12 text-center">
          <div className="flex flex-col md:flex-row justify-center items-center mt-6 space-y-4 md:space-y-0 md:space-x-6">
            <div className="flex items-center space-x-2">
              <Lock className="h-4 w-4 text-slate-400" />
              <span className="text-sm text-slate-600">Secure payment</span>
            </div>
            <div className="flex items-center space-x-3">
              <CreditCard className="h-4 w-4 text-slate-400" />
              <div className="flex items-center space-x-2">
                <img src="/visa.svg" alt="Visa" className="h-6" />
                <img src="/mastercard.svg" alt="Mastercard" className="h-6" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Pricing; 