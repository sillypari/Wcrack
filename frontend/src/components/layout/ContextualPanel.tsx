import * as React from "react"
import { X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface ContextualPanelProps {
  isOpen: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
}

export function ContextualPanel({ isOpen, onClose, title, children }: ContextualPanelProps) {
  
  // D89: Only Esc and X close the panel.
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose()
      }
    }
    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [isOpen, onClose])

  return (
    <div
      className={cn(
        "absolute top-0 right-0 h-full w-[380px] bg-bg-surface border-l border-border shadow-2xl z-20 flex flex-col transition-transform duration-250 ease-out",
        isOpen ? "translate-x-0" : "translate-x-full"
      )}
    >
      <div className="flex items-center justify-between p-4 border-b border-border">
        <h3 className="font-semibold text-text-primary truncate">{title}</h3>
        <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8 text-text-secondary hover:text-text-primary hover:bg-bg-hover" aria-label="Close panel">
          <X className="w-4 h-4" />
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 relative">
        {/* The children can handle the cross-fade animation inside themselves based on data changes */}
        {children}
      </div>
    </div>
  )
}
