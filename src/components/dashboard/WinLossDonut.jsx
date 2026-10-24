import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts'
import ChartCard from './ChartCard'
import { winLoss } from '../../data/mockData'

const COLORS = ['#16A34A', '#DC2626']

export default function WinLossDonut() {
  return (
    <ChartCard title="Win / Loss">
      <div className="h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={winLoss}
              dataKey="value"
              nameKey="name"
              innerRadius={55}
              outerRadius={80}
              paddingAngle={3}
              strokeWidth={0}
            >
              {winLoss.map((entry, i) => (
                <Cell key={i} fill={COLORS[i]} />
              ))}
            </Pie>
            <Tooltip
              formatter={(value, name) => [`${value}%`, name]}
              contentStyle={{ borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 13 }}
            />
            <Legend
              verticalAlign="bottom"
              iconType="circle"
              formatter={(value) => <span className="text-sm text-text-secondary">{value}</span>}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  )
}
