import * as React from "react"
import { Button } from "@/components/ui/button"

export function WelcomeOverlay() {
  const [isOpen, setIsOpen] = React.useState(false)
  const [step, setStep] = React.useState(0)

  React.useEffect(() => {
    const welcomed = localStorage.getItem("wcarck.welcomed")
    if (!welcomed) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setIsOpen(true)
    }
  }, [])

  const handleClose = () => {
    localStorage.setItem("wcarck.welcomed", "1")
    setIsOpen(false)
  }

  const handleNext = () => {
    if (step < 2) setStep(step + 1)
    else handleClose()
  }

  if (!isOpen) return null

  const steps = [
    { title: "Pick an adapter", text: "Select your wireless interface from the top right to get started." },
    { title: "Start a scan", text: "Head over to the Reconnaissance page and click Start Scan to discover nearby networks." },
    { title: "See results", text: "Select a network to view details and launch attacks like Evil Twin." },
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="bg-bg-elevated border border-border p-6 rounded-xl max-w-md w-full shadow-2xl">
        <h2 className="text-xl font-semibold text-text-primary mb-2">Welcome to Wcarck</h2>
        <h3 className="text-md font-medium text-text-secondary mb-1">{steps[step].title}</h3>
        <p className="text-sm text-text-tertiary mb-6">{steps[step].text}</p>
        
        <div className="flex justify-between items-center">
          <div className="flex space-x-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className={`h-2 w-2 rounded-full ${i === step ? "bg-accent" : "bg-border-strong"}`} />
            ))}
          </div>
          <div className="space-x-2">
            <Button variant="ghost" onClick={handleClose} className="text-text-secondary">Skip</Button>
            <Button onClick={handleNext} className="bg-accent text-accent-foreground hover:bg-accent-hover">
              {step === 2 ? "Got it" : "Next"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
