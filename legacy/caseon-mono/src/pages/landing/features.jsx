import React from 'react';
import { Search, Users, FileText, Zap, ArrowRight, Scale, Gavel, BookOpen } from 'lucide-react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

const Features = () => {
  const features = [
    {
      icon: <Search className="h-7 w-7 text-indigo-600" />,
      title: "AI-Powered Legal Research",
      description: "Find relevant South African cases instantly using natural language. Our AI understands legal context and delivers precise results tailored to your query.",
      color: "from-indigo-50 to-blue-50",
      accentColor: "border-indigo-100",
      iconBg: "bg-indigo-100"
    },
    {
      icon: <Users className="h-7 w-7 text-indigo-600" />,
      title: "Team Collaboration",
      description: "Work seamlessly with your entire legal team. Share case collections, assign research tasks, and collaborate in real-time on complex legal matters.",
      color: "from-purple-50 to-indigo-50",
      accentColor: "border-purple-100",
      iconBg: "bg-purple-100"
    },
    {
      icon: <FileText className="h-7 w-7 text-indigo-600" />,
      title: "PDF Export & Sharing",
      description: "Export cases with proper citations and formatting. Create professional PDF reports with your branding to share directly with clients or the court.",
      color: "from-blue-50 to-cyan-50",
      accentColor: "border-blue-100",
      iconBg: "bg-blue-100"
    }
  ];

  return (
    <section className="py-12 px-4 md:px-8 bg-gradient-to-b from-white to-slate-50 overflow-hidden relative">
      {/* Background legal pattern */}
      <div className="absolute inset-0 z-0 overflow-hidden opacity-[0.03]">
        <svg className="absolute top-0 left-0 w-full h-full" viewBox="0 0 1000 1000" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none">
          {/* Subtle horizontal lines like legal documents */}
          {[...Array(40)].map((_, i) => (
            <line 
              key={i} 
              x1="0" 
              y1={25 * i} 
              x2="1000" 
              y2={25 * i} 
              stroke="#1e293b" 
              strokeWidth="0.5" 
              strokeDasharray={i % 10 === 0 ? "none" : "1,3"}
            />
          ))}
          
          {/* Scales of justice symbol */}
          <g transform="translate(200, 200) scale(0.15)">
            <path d="M250,100 L750,100 M500,100 V500" stroke="#1e293b" strokeWidth="20" />
            <circle cx="250" cy="200" r="100" fill="none" stroke="#1e293b" strokeWidth="10" />
            <circle cx="750" cy="200" r="100" fill="none" stroke="#1e293b" strokeWidth="10" />
            <rect x="400" y="500" width="200" height="100" fill="none" stroke="#1e293b" strokeWidth="10" />
          </g>
          
          {/* Gavel symbol */}
          <g transform="translate(700, 600) scale(0.15)">
            <rect x="200" y="400" width="600" height="100" fill="none" stroke="#1e293b" strokeWidth="10" />
            <rect x="450" y="100" width="100" height="300" transform="rotate(45, 500, 100)" fill="none" stroke="#1e293b" strokeWidth="10" />
          </g>
        </svg>
      </div>
      
      <div className="max-w-7xl mx-auto relative z-10">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center mb-12"
        >
          <div className="flex items-center justify-center mb-3">
            <div className="w-12 h-12 rounded-xl bg-indigo-50 flex items-center justify-center mr-3 shadow-sm">
              <Gavel className="h-6 w-6 text-indigo-600" />
            </div>
            <Badge variant="outline" className="text-indigo-700 border-indigo-200 bg-indigo-50/80 backdrop-blur-sm px-3 py-1.5 text-sm font-medium">
              <Zap className="h-3.5 w-3.5 mr-1.5" />
              Powerful Features
            </Badge>
          </div>
          
          <h2 className="text-2xl md:text-3xl font-medium text-slate-800 mb-4">
            <span className="border-b-2 border-amber-300 pb-1">South African Legal Research</span>
            <span className="text-slate-600 font-normal"> — powerful features at your fingertips</span>
          </h2>
          
          <p className="text-base text-slate-600 max-w-2xl mx-auto">
            Our platform is designed specifically for South African legal professionals, combining AI technology with comprehensive legal databases.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8 relative">
          {/* Decorative element */}
          <div className="absolute top-1/2 left-0 right-0 h-px bg-gradient-to-r from-transparent via-indigo-200 to-transparent"></div>
          
          {features.map((feature, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              whileHover={{ y: -5, transition: { duration: 0.2 } }}
              className="relative"
            >
              <div className="absolute inset-0 rounded-2xl md:rounded-3xl bg-gradient-to-br from-white to-slate-50 shadow-md opacity-50 transform rotate-1"></div>
              
              <div className={`relative h-full rounded-2xl md:rounded-3xl bg-gradient-to-br ${feature.color} border-2 ${feature.accentColor} shadow-sm p-8 md:p-10 transition-all duration-300`}>
                {/* Document binding edge */}
                <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-amber-400 rounded-l-xl"></div>
                
                {/* Document corner fold */}
                <div className="absolute top-0 right-0 w-0 h-0 border-t-[40px] border-r-[40px] border-t-transparent border-r-indigo-50"></div>
                
                <div className="flex flex-col h-full">
                  <div className="w-16 h-16 rounded-2xl flex items-center justify-center shadow-sm border border-slate-100 mb-6 bg-white">
                    <div className={`w-12 h-12 rounded-xl ${feature.iconBg} flex items-center justify-center`}>
                      {feature.icon}
                    </div>
                  </div>
                  
                  <h3 className="text-2xl md:text-2xl font-serif font-bold text-slate-900 mb-4 flex items-center">
                    <div className="w-2 h-2 rounded-full bg-amber-400 mr-2.5"></div>
                    {feature.title}
                  </h3>
                  
                  <div className="relative">
                    <div className="absolute -left-4 top-0 bottom-0 w-px border-l border-dashed border-slate-300"></div>
                    <p className="text-base text-slate-600 leading-relaxed mb-6 pl-6">{feature.description}</p>
                  </div>
                  
                  <div className="mt-auto pt-4">
                    <motion.button 
                      className="flex items-center text-sm font-medium text-indigo-600 hover:text-indigo-800 transition-colors"
                      whileHover={{ x: 5 }}
                    >
                      Learn more
                      <ArrowRight className="ml-1 h-4 w-4" />
                    </motion.button>
                  </div>
                </div>
                
                {/* Page number styling */}
                <div className="absolute bottom-3 right-3 text-xs text-slate-400 font-serif">§ {index + 1}</div>
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
          className="mt-16 text-center bg-gradient-to-br from-indigo-600 to-indigo-700 rounded-2xl md:rounded-3xl p-10 md:p-14 shadow-xl relative overflow-hidden"
        >
          {/* Background decoration */}
          <div className="absolute top-0 left-0 w-full h-full overflow-hidden">
            <div className="absolute -top-[20%] -left-[10%] w-[60%] h-[60%] rounded-full bg-indigo-500/50 blur-3xl"></div>
            <div className="absolute -bottom-[20%] -right-[10%] w-[60%] h-[60%] rounded-full bg-indigo-400/30 blur-3xl"></div>
            
            {/* Legal pattern overlay */}
            <div className="absolute inset-0 opacity-10">
              <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
                {[...Array(20)].map((_, i) => (
                  <line 
                    key={i} 
                    x1="0" 
                    y1={20 * i} 
                    x2="100%" 
                    y2={20 * i} 
                    stroke="#ffffff" 
                    strokeWidth="0.5" 
                    strokeDasharray="5,5"
                  />
                ))}
              </svg>
            </div>
          </div>
          
          <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-8">
            <div className="text-left max-w-lg">
              <div className="flex items-center mb-4">
                <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center mr-3">
                  <Scale className="h-5 w-5 text-white" />
                </div>
                <Badge className="bg-white/20 text-white hover:bg-white/30 border-0">
                  Take Action Now
                </Badge>
              </div>
              <h3 className="text-2xl md:text-3xl font-serif font-bold text-white mb-4">
                Ready to transform your legal research?
              </h3>
              <p className="text-indigo-100 mb-6 text-sm md:text-base">
                Join thousands of South African legal professionals already using CaseOn to find relevant cases faster.
              </p>
            </div>
            
            <div className="flex flex-col items-center md:items-end gap-3">
              <Button size="lg" className="bg-white text-indigo-700 hover:bg-indigo-50 px-8 py-6 text-base font-medium shadow-lg group transition-all duration-300 ease-in-out">
                Start for Free
                <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
              </Button>
              <p className="text-sm text-indigo-200">
                No credit card required • Cancel anytime
              </p>
            </div>
          </div>
          
          {/* Decorative legal elements */}
          <div className="absolute bottom-0 left-0 w-20 h-20 opacity-10">
            <BookOpen className="w-full h-full text-white" />
          </div>
          <div className="absolute top-4 right-4 w-12 h-12 opacity-10">
            <Gavel className="w-full h-full text-white" />
          </div>
        </motion.div>
      </div>
    </section>
  );
};

export default Features; 