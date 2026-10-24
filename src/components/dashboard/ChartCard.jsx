import Card from '../ui/Card'

export default function ChartCard({ title, controls, children, className = '' }) {
  return (
    <Card className={className}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-[18px] font-semibold text-text-primary">{title}</h3>
        {controls}
      </div>
      {children}
    </Card>
  )
}
