import React from 'react';
import { Search, Users, FileText, Zap, ArrowRight } from 'lucide-react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

const Features = () => {
  const features = [
    {
      icon: <Search className="h-7 w-7 text-indigo-600" />,
      title: "AI-Powered Legal Research",
      description: "Find relevant South African cases instantly using natural language. Our AI understands legal context and delivers precise results tailored to your query.",
      color: "from-indigo-50 to-blue-50"
    },
    {
      icon: <Users className="h-7 w-7 text-indigo-600" />,
      title: "Team Collaboration",
      description: "Work seamlessly with your entire legal team. Share case collections, assign research tasks, and collaborate in real-time on complex legal matters.",
      color: "from-purple-50 to-indigo-50"
    },
    {
      icon: <FileText className="h-7 w-7 text-indigo-600" />,
      title: "PDF Export & Sharing",
      description: "Export cases with proper citations and formatting. Create professional PDF reports with your branding to share directly with clients or the court.",
      color: "from-blue-50 to-cyan-50"
    }
  ];

  return (
    <section className="py-6 pt-2 md:pt-4 px-4 md:px-8 bg-gradient-to-b from-white to-slate-50 overflow-hidden">
      <div className="max-w-7xl mx-auto">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center mb-8"
        >
          <Badge variant="outline" className="text-indigo-700 border-indigo-200 bg-indigo-50/80 backdrop-blur-sm mb-3 px-3 py-1.5 text-sm font-medium">
            <Zap className="h-3.5 w-3.5 mr-1.5" />
            Powerful Features
          </Badge>
          <h2 className="text-2xl md:text-4xl font-serif font-bold text-slate-900 mb-4 leading-tight">
            Everything You Need for<br className="hidden md:block" /> South African Legal Research
          </h2>
          <p className="text-base md:text-lg text-slate-600 max-w-2xl mx-auto">
            Our platform is designed specifically for South African legal professionals, combining AI technology with comprehensive legal databases.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8">
          {features.map((feature, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              className="relative"
            >
              <div className={`h-full rounded-2xl md:rounded-3xl bg-gradient-to-br ${feature.color} border border-slate-100 shadow-sm p-6 md:p-8 hover:shadow-md transition-all duration-300 group`}>
                <div className="absolute -top-4 md:-top-6 -left-4 md:-left-6 w-14 h-14 md:w-18 md:h-18 rounded-xl bg-white flex items-center justify-center shadow-sm border border-slate-100 group-hover:shadow-md transition-all duration-300">
                  {feature.icon}
                </div>
                
                <div className="mt-6 md:mt-8 ml-6 md:ml-4">
                  <h3 className="text-xl md:text-2xl font-serif font-bold text-slate-900 mb-2 md:mb-4">{feature.title}</h3>
                  <p className="text-sm md:text-base text-slate-600 leading-relaxed">{feature.description}</p>
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        {/* CTA Section */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="mt-12 text-center bg-indigo-600 rounded-2xl md:rounded-3xl p-8 md:p-12 shadow-xl relative overflow-hidden"
        >
          {/* Background decoration */}
          <div className="absolute top-0 left-0 w-full h-full overflow-hidden">
            <div className="absolute -top-[20%] -left-[10%] w-[60%] h-[60%] rounded-full bg-indigo-500/50 blur-3xl"></div>
            <div className="absolute -bottom-[20%] -right-[10%] w-[60%] h-[60%] rounded-full bg-indigo-400/30 blur-3xl"></div>
          </div>
          
          <div className="relative z-10">
            <h3 className="text-xl md:text-2xl font-serif font-bold text-white mb-4">
              Ready to transform your legal research?
            </h3>
            <p className="text-indigo-100 max-w-xl mx-auto mb-6 text-sm md:text-base">
              Join thousands of South African legal professionals already using CaseOn to find relevant cases faster.
            </p>
            <Button size="lg" className="bg-white text-indigo-700 hover:bg-indigo-50 px-6 md:px-8 py-4 md:py-6 text-sm md:text-base font-medium">
              Start for Free
              <ArrowRight className="ml-2 h-4 w-4 md:h-5 md:w-5" />
            </Button>
            <p className="mt-4 text-xs md:text-sm text-indigo-200">
              No credit card required • Cancel anytime
            </p>
          </div>
        </motion.div>
      </div>
    </section>
  );
};

export default Features; 