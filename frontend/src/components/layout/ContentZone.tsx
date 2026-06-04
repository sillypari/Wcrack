import * as React from "react"
import { useWcarckStore } from "@/store/useWcarckStore"
import { cn } from "@/lib/utils"

export function ContentZone({ children }: { children: React.ReactNode }) {
  const { uiState } = useWcarckStore()
  const focusMode = uiState.focusMode

  return (
    <main 
      className={cn(
        "flex-1 overflow-auto bg-bg-root p-6 relative transition-opacity duration-300",
        focusMode ? "opacity-90 grayscale-[0.2]" : ""
      )}
    >
      <div className="max-w-[1600px] mx-auto h-full flex flex-col">
        {children}
      </div>
    </main>
  )
}
