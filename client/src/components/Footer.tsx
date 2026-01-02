import { Twitter, Send, Github, BookOpen } from "lucide-react";
import { Link } from "wouter";

export default function Footer() {
  return (
    <footer className="py-12 border-t border-white/10 bg-[#050505]/80 backdrop-blur-[2px] relative z-10">
      <div className="container mx-auto px-6">
        <div className="flex flex-col md:flex-row justify-between items-center gap-8">
          <div className="text-center md:text-left">
            <h3 className="text-2xl font-bold font-heading text-white mb-2">MODEXO</h3>
          </div>

          <div className="flex gap-6 items-center">
            <a href="https://modexo.gitbook.io/modexo-docs" target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-primary transition-colors">
              <BookOpen size={24} />
            </a>
            <a href="https://x.com/modex420o?s=21" target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-primary transition-colors">
              <Twitter size={24} />
            </a>
            <div className="flex items-center gap-2 text-gray-400">
              <Send size={24} />
              <span className="text-xs">Coming in a week</span>
            </div>
            <a href="https://github.com/Modex402o/modexo" target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-primary transition-colors">
              <Github size={24} />
            </a>
          </div>
        </div>
        
        <div className="mt-12 pt-8 border-t border-white/5 text-center text-gray-600 text-sm">
          © 2025 MODEXO. All rights reserved. Not financial advice.
        </div>
      </div>
    </footer>
  );
}
