import { useState, useEffect } from "react";
import { Scale, Gavel, BookOpen } from "lucide-react";

// Collection of legal quotes
const legalQuotes = [
  // Suits quotes
  { text: "When you're backed against the wall, break the goddamn thing down.", author: "Harvey Specter, Suits" },
  { text: "I don't play the odds, I play the man.", author: "Harvey Specter, Suits" },
  { text: "It's not bragging if it's true.", author: "Harvey Specter, Suits" },
  { text: "Winners don't make excuses.", author: "Harvey Specter, Suits" },
  { text: "Sometimes the good guys gotta do bad things to make the bad guys pay.", author: "Mike Ross, Suits" },
  
  // Law & Order quotes
  { text: "In the criminal justice system, the people are represented by two separate yet equally important groups.", author: "Law & Order" },
  { text: "These are their stories.", author: "Law & Order" },
  { text: "The job isn't to make them like you, it's to make them believe you.", author: "Jack McCoy, Law & Order" },
  { text: "Your rights end where the victims' rights begin.", author: "Jack McCoy, Law & Order" },
  
  // Latin legal phrases used in South African law
  { text: "Audi alteram partem", author: "Latin (Hear the other side)" },
  { text: "Stare decisis", author: "Latin (To stand by decisions)" },
  { text: "In dubio pro reo", author: "Latin (When in doubt, for the accused)" },
  { text: "Lex non cogit ad impossibilia", author: "Latin (The law does not compel the impossible)" },
  { text: "Fiat justitia ruat caelum", author: "Latin (Let justice be done though the heavens fall)" },
  { text: "Ubi jus ibi remedium", author: "Latin (Where there is a right, there is a remedy)" },
  { text: "Ignorantia juris non excusat", author: "Latin (Ignorance of the law excuses not)" },
  
  // South African legal principles
  { text: "Ubuntu - I am because we are", author: "South African Legal Philosophy" },
  { text: "The Constitution is the supreme law of the Republic", author: "South African Constitution" },
];

export default function LegalLoader({ isLoading, message = "Searching legal documents..." }) {
  const [currentQuote, setCurrentQuote] = useState(getRandomQuote());
  const [iconIndex, setIconIndex] = useState(0);
  
  const icons = [
    <Scale key="scale" className="h-10 w-10 text-green-700" />,
    <Gavel key="gavel" className="h-10 w-10 text-green-700" />,
    <BookOpen key="book" className="h-10 w-10 text-green-700" />
  ];
  
  // Get a random quote
  function getRandomQuote() {
    const randomIndex = Math.floor(Math.random() * legalQuotes.length);
    return legalQuotes[randomIndex];
  }
  
  // Change quote randomly every 30 seconds
  useEffect(() => {
    if (!isLoading) return;
    
    const quoteInterval = setInterval(() => {
      setCurrentQuote(getRandomQuote());
    }, 30000); // 30 seconds
    
    const iconInterval = setInterval(() => {
      setIconIndex((prevIndex) => (prevIndex + 1) % icons.length);
    }, 2000);
    
    return () => {
      clearInterval(quoteInterval);
      clearInterval(iconInterval);
    };
  }, [isLoading, icons.length]);
  
  // Set initial quote when loading starts
  useEffect(() => {
    if (isLoading) {
      setCurrentQuote(getRandomQuote());
    }
  }, [isLoading]);
  
  if (!isLoading) return null;
  
  return (
    <div className="flex flex-col items-center justify-center h-full py-8">
      {/* Animated icon */}
      <div className="relative mb-6">
        <div className="animate-pulse">
          {icons[iconIndex]}
        </div>
        <div className="absolute -top-1 -right-1 h-3 w-3 bg-green-500 rounded-full animate-ping" />
      </div>
      
      {/* Quote display with animation */}
      <div key={currentQuote.text} className="mt-4 max-w-md text-center animate-fadeIn">
        <p className="font-heading text-lg text-slate-700 italic">"{currentQuote.text}"</p>
        <p className="text-sm text-slate-500 mt-2">— {currentQuote.author}</p>
      </div>
      
      {/* Loading message */}
      <div className="mt-6 flex items-center gap-2">
        <div className="relative w-16 h-1 bg-slate-200 rounded-full overflow-hidden">
          <div className="absolute inset-0 bg-green-600 animate-progressBar"></div>
        </div>
        <span className="text-sm text-slate-600">{message}</span>
      </div>
      
      {/* Custom animation styles */}
      <style jsx>{`
        @keyframes fadeIn {
          0% { opacity: 0; transform: translateY(10px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        
        @keyframes progressBar {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
        
        .animate-fadeIn {
          animation: fadeIn 0.7s ease-in-out;
        }
        
        .animate-progressBar {
          animation: progressBar 2s linear infinite;
        }
      `}</style>
    </div>
  );
} 