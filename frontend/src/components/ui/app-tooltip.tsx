import * as React from "react"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

export function AppTooltip({
  children,
  content,
  delayDuration = 300,
  side = "bottom",
}: {
  children: React.ReactNode
  content: React.ReactNode
  delayDuration?: number
  side?: "top" | "right" | "bottom" | "left"
}) {
  return (
    <TooltipProvider delayDuration={delayDuration}>
      <Tooltip>
        <TooltipTrigger asChild>
          {children}
        </TooltipTrigger>
        <TooltipContent side={side} className="max-w-[280px] bg-bg-elevated text-text-primary border border-border-subtle shadow-md text-sm px-3 py-1.5 rounded-md">
          {content}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
