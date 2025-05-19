import React from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const Pricing = () => {
  const navigate = useNavigate();

  return (
    <section className="py-20 px-4 md:px-8 bg-gray-50">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-serif font-bold text-slate-900">Simple Pricing</h2>
          <p className="mt-4 text-lg text-slate-600 max-w-2xl mx-auto">
            Choose your access level.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Free Tier */}
          <Card className={cn(
            "border border-slate-200 transition-shadow hover:shadow-md relative overflow-hidden",
          )}>
            <div className="absolute top-0 inset-x-0 h-2 bg-slate-400"></div>
            <CardHeader>
              <CardTitle className="text-2xl font-serif font-bold text-slate-800">Free</CardTitle>
              <CardDescription className="text-slate-600">Try it out</CardDescription>
              <div className="mt-4">
                <span className="text-3xl font-bold text-slate-900">Free</span>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-slate-600">Limited access</p>
            </CardContent>
            <CardFooter>
              <Button variant="outline" className="w-full" onClick={() => navigate('/signup')}>
                Start for Free
              </Button>
            </CardFooter>
          </Card>

          {/* Basic Tier */}
          <Card className={cn(
            "border border-slate-200 transition-shadow hover:shadow-md relative overflow-hidden",
            "shadow-lg scale-105 z-10"
          )}>
            <div className="absolute top-0 inset-x-0 h-2 bg-indigo-600"></div>
            <CardHeader>
              <div className="flex justify-between items-center">
                <CardTitle className="text-2xl font-serif font-bold text-slate-800">Basic</CardTitle>
                <Badge className="bg-indigo-100 text-indigo-700 hover:bg-indigo-100 border-0">Popular</Badge>
              </div>
              <CardDescription className="text-slate-600">More access</CardDescription>
              <div className="mt-4">
                <span className="text-3xl font-bold text-slate-900">R100</span>
                <span className="text-sm text-slate-600">/month</span>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-slate-600">Less limited access</p>
            </CardContent>
            <CardFooter>
              <Button className="w-full bg-indigo-700 hover:bg-indigo-800" onClick={() => navigate('/signup')}>
                Get Started
              </Button>
            </CardFooter>
          </Card>

          {/* Premium Tier */}
          <Card className={cn(
            "border border-slate-200 transition-shadow hover:shadow-md relative overflow-hidden",
          )}>
            <div className="absolute top-0 inset-x-0 h-2 bg-slate-800"></div>
            <CardHeader>
              <CardTitle className="text-2xl font-serif font-bold text-slate-800">Pro</CardTitle>
              <CardDescription className="text-slate-600">Unlimited access</CardDescription>
              <div className="mt-4">
                <span className="text-3xl font-bold text-slate-900">R400</span>
                <span className="text-sm text-slate-600">/month</span>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-slate-600">Unlimited access</p>
            </CardContent>
            <CardFooter>
              <Button variant="outline" className="w-full border-slate-800 text-slate-800 hover:bg-slate-100" onClick={() => navigate('/signup')}>
                Get Started
              </Button>
            </CardFooter>
          </Card>
        </div>
      </div>
    </section>
  );
};

export default Pricing; 