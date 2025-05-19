import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Gavel, Scale, CheckCircle2, ShieldCheck, BookOpen, Bookmark } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import TopBar from '@/components/nav/top-bar';
import { cn } from '@/lib/utils';

const LandingPage = () => {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <TopBar />

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-4 md:px-8 bg-gradient-to-b from-indigo-50 via-white to-white relative">
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div className="space-y-8">
              <div>
                <Badge variant="outline" className="text-indigo-700 border-indigo-200 bg-indigo-50 mb-4 px-3 py-1 text-sm font-medium">
                  Legal Research Reimagined
                </Badge>
                <h1 className="text-4xl md:text-5xl lg:text-6xl font-serif font-bold tracking-tight text-slate-900 leading-tight">
                  Find Legal <span className="text-indigo-700">Cases</span> in Seconds
                </h1>
                <p className="mt-6 text-lg text-slate-600 max-w-lg">
                  CaseOn delivers intelligent legal research tools that help attorneys quickly find relevant cases and legal precedents.
                </p>
              </div>

              <div className="relative max-w-lg">
                <div className="flex items-center w-full max-w-lg">
                  <div className="relative w-full">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                    <Input 
                      type="text" 
                      placeholder="Search for cases, legal topics, or keywords..." 
                      className="pl-10 pr-20 py-6 w-full border border-slate-200 shadow-sm rounded-l-lg rounded-r-none focus:ring-indigo-500 focus:border-indigo-500"
                    />
                  </div>
                  <Button 
                    size="lg" 
                    className="rounded-l-none rounded-r-lg bg-indigo-700 hover:bg-indigo-800"
                  >
                    Search
                  </Button>
                </div>
                <p className="text-sm text-slate-500 mt-2">
                  Try: "Fair discrimination act" or "Contract breach remedies"
                </p>
              </div>

              <div className="flex items-center gap-4 text-sm text-slate-600">
                <div className="flex items-center gap-1">
                  <CheckCircle2 className="h-4 w-4 text-indigo-600" />
                  <span>Accurate Results</span>
                </div>
                <div className="flex items-center gap-1">
                  <CheckCircle2 className="h-4 w-4 text-indigo-600" />
                  <span>Fast Search</span>
                </div>
                <div className="flex items-center gap-1">
                  <CheckCircle2 className="h-4 w-4 text-indigo-600" />
                  <span>Smart Citations</span>
                </div>
              </div>
            </div>

            <div className="relative order-first lg:order-last">
              <div className="absolute inset-0 bg-indigo-600 rounded-full opacity-5 blur-3xl transform -rotate-6"></div>
              <div className="relative bg-white border border-slate-200 rounded-xl shadow-lg p-6 overflow-hidden">
                <div className="flex items-center gap-3 mb-6">
                  <div className="h-3 w-3 rounded-full bg-red-400"></div>
                  <div className="h-3 w-3 rounded-full bg-amber-400"></div>
                  <div className="h-3 w-3 rounded-full bg-green-400"></div>
                  <div className="ml-auto text-xs text-slate-400 font-mono">CaseOn Research</div>
                </div>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <div className="text-sm font-medium text-slate-700">Case: Smith v. Johnson (2022)</div>
                    <p className="text-sm text-slate-600 pl-4 border-l-2 border-indigo-500">
                      "The court finds that in matters of contractual interpretation, the express terms must be given their ordinary meaning unless a contrary intention appears from the whole of the agreement."
                    </p>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center">
                      <Badge className="bg-indigo-100 text-indigo-700 hover:bg-indigo-100 border-0">Related</Badge>
                      <div className="text-xs text-slate-500 ml-2">3 similar cases</div>
                    </div>
                    <div className="pl-4 space-y-1 text-xs text-slate-500 border-l-2 border-slate-200">
                      <div>• Phillips v. Martin Group (2020)</div>
                      <div>• ABC Holdings v. XYZ Corp (2021)</div>
                      <div>• Meyer Trust v. Oceanic Systems (2019)</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 px-4 md:px-8 bg-white">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-serif font-bold text-slate-900">Why Legal Professionals Choose CaseOn</h2>
            <p className="mt-4 text-lg text-slate-600 max-w-2xl mx-auto">
              Our platform combines cutting-edge technology with comprehensive legal databases to provide unmatched research capabilities.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {[
              {
                icon: <Search className="h-6 w-6 text-indigo-600" />,
                title: "Intelligent Search",
                description: "Find relevant cases using natural language search powered by advanced AI algorithms."
              },
              {
                icon: <Scale className="h-6 w-6 text-indigo-600" />,
                title: "Comprehensive Coverage",
                description: "Access thousands of case reports, statutes, and legal documents from a single platform."
              },
              {
                icon: <Gavel className="h-6 w-6 text-indigo-600" />,
                title: "Case Analysis",
                description: "Understand case relationships, citations, and legal precedents with visual tools."
              },
              {
                icon: <ShieldCheck className="h-6 w-6 text-indigo-600" />,
                title: "Trusted Accuracy",
                description: "Rely on verified and up-to-date information reviewed by legal experts."
              },
              {
                icon: <BookOpen className="h-6 w-6 text-indigo-600" />,
                title: "Legal Library",
                description: "Browse categorized collections of cases by jurisdiction, subject matter, or time period."
              },
              {
                icon: <Bookmark className="h-6 w-6 text-indigo-600" />,
                title: "Save & Organize",
                description: "Create personal collections and annotate cases for your specific needs."
              }
            ].map((feature, index) => (
              <Card key={index} className="border border-slate-200 transition-shadow hover:shadow-md">
                <CardHeader className="pb-2">
                  <div className="h-12 w-12 rounded-full bg-indigo-50 flex items-center justify-center mb-4">
                    {feature.icon}
                  </div>
                  <CardTitle className="text-xl font-serif font-bold text-slate-800">{feature.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-slate-600">{feature.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section className="py-20 px-4 md:px-8 bg-gray-50">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-serif font-bold text-slate-900">Straightforward Pricing</h2>
            <p className="mt-4 text-lg text-slate-600 max-w-2xl mx-auto">
              Choose the plan that fits your needs. No hidden fees.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Free Tier */}
            <Card className={cn(
              "border border-slate-200 transition-shadow hover:shadow-md relative overflow-hidden",
            )}>
              <div className="absolute top-0 inset-x-0 h-2 bg-slate-400"></div>
              <CardHeader>
                <CardTitle className="text-2xl font-serif font-bold text-slate-800">Free Trial</CardTitle>
                <CardDescription className="text-slate-600">Just to try it out</CardDescription>
                <div className="mt-4">
                  <span className="text-3xl font-bold text-slate-900">Free</span>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <ul className="space-y-3">
                  {["Limited searches", "Basic case access", "7-day access"].map((feature, i) => (
                    <li key={i} className="flex items-center gap-2 text-slate-700">
                      <CheckCircle2 className="h-5 w-5 text-slate-400" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
              <CardFooter>
                <Button variant="outline" className="w-full" onClick={() => navigate('/signup')}>
                  Start Free Trial
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
                <CardDescription className="text-slate-600">Limited usage</CardDescription>
                <div className="mt-4">
                  <span className="text-3xl font-bold text-slate-900">R100</span>
                  <span className="text-sm text-slate-600">/month</span>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <ul className="space-y-3">
                  {["100 searches/month", "Full case access", "Save cases", "PDF exports", "Email support"].map((feature, i) => (
                    <li key={i} className="flex items-center gap-2 text-slate-700">
                      <CheckCircle2 className="h-5 w-5 text-indigo-600" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
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
                <CardTitle className="text-2xl font-serif font-bold text-slate-800">Unlimited</CardTitle>
                <CardDescription className="text-slate-600">Unlimited usage</CardDescription>
                <div className="mt-4">
                  <span className="text-3xl font-bold text-slate-900">R400</span>
                  <span className="text-sm text-slate-600">/month</span>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <ul className="space-y-3">
                  {["Unlimited searches", "Advanced filtering", "AI case summaries", "Team sharing", "Priority support", "API access", "Fair usage policy applies"].map((feature, i) => (
                    <li key={i} className="flex items-center gap-2 text-slate-700">
                      <CheckCircle2 className="h-5 w-5 text-slate-800" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
              <CardFooter>
                <Button variant="outline" className="w-full border-slate-800 text-slate-800 hover:bg-slate-100" onClick={() => navigate('/signup')}>
                  Upgrade Now
                </Button>
              </CardFooter>
            </Card>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-4 md:px-8 bg-indigo-700 text-white">
        <div className="max-w-5xl mx-auto text-center">
          <h2 className="text-3xl font-serif font-bold mb-6">Ready to Transform Your Legal Research?</h2>
          <p className="text-lg text-indigo-100 mb-8 max-w-2xl mx-auto">
            Join thousands of legal professionals who trust CaseOn to find the cases they need, when they need them.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button 
              size="lg" 
              className="bg-white text-indigo-700 hover:bg-indigo-50"
              onClick={() => navigate('/signup')}
            >
              Start Free Trial
            </Button>
            <Button 
              size="lg" 
              variant="outline" 
              className="border-white text-white hover:bg-indigo-600"
              onClick={() => navigate('/demo')}
            >
              Request Demo
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-4 md:px-8 bg-slate-900 text-slate-400">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col md:flex-row justify-between gap-8">
            <div>
              <div className="flex items-center gap-2 text-white mb-4">
                <img src="/icon.svg" alt="CaseOn Logo" className="h-8 w-8" />
                <div className="flex flex-col">
                  <span className="text-lg font-serif font-bold tracking-tight">CaseOn</span>
                  <span className="text-[10px] font-medium tracking-wider text-slate-400 uppercase">Legal Intelligence</span>
                </div>
              </div>
              <p className="max-w-xs text-sm">
                Transforming legal research with cutting-edge technology and comprehensive case databases.
              </p>
            </div>
            
            <div className="grid grid-cols-2 md:grid-cols-3 gap-8">
              <div>
                <h3 className="text-white font-medium mb-4">Products</h3>
                <ul className="space-y-2 text-sm">
                  <li><a href="#" className="hover:text-white transition-colors">Case Search</a></li>
                  <li><a href="#" className="hover:text-white transition-colors">Legal Analytics</a></li>
                  <li><a href="#" className="hover:text-white transition-colors">Document Management</a></li>
                  <li><a href="#" className="hover:text-white transition-colors">API Access</a></li>
                </ul>
              </div>
              
              <div>
                <h3 className="text-white font-medium mb-4">Resources</h3>
                <ul className="space-y-2 text-sm">
                  <li><a href="#" className="hover:text-white transition-colors">Blog</a></li>
                  <li><a href="#" className="hover:text-white transition-colors">Help Center</a></li>
                  <li><a href="#" className="hover:text-white transition-colors">Guides</a></li>
                  <li><a href="#" className="hover:text-white transition-colors">Webinars</a></li>
                </ul>
              </div>
              
              <div>
                <h3 className="text-white font-medium mb-4">Company</h3>
                <ul className="space-y-2 text-sm">
                  <li><a href="#" className="hover:text-white transition-colors">About</a></li>
                  <li><a href="#" className="hover:text-white transition-colors">Careers</a></li>
                  <li><a href="#" className="hover:text-white transition-colors">Contact</a></li>
                  <li><a href="#" className="hover:text-white transition-colors">Legal</a></li>
                </ul>
              </div>
            </div>
          </div>
          
          <div className="mt-12 pt-8 border-t border-slate-800 flex flex-col md:flex-row justify-between items-center gap-4">
            <p className="text-xs">© {new Date().getFullYear()} CaseOn. All rights reserved.</p>
            <div className="flex items-center gap-6">
              <a href="#" className="text-xs hover:text-white transition-colors">Privacy Policy</a>
              <a href="#" className="text-xs hover:text-white transition-colors">Terms of Service</a>
              <a href="#" className="text-xs hover:text-white transition-colors">Cookie Policy</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
