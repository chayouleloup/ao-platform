export default function Loading() {
  return (
    <div className="p-8">
      <div className="animate-pulse space-y-4">
        <div className="h-8 bg-slate-800 rounded-xl w-48" />
        <div className="grid grid-cols-4 gap-4">
          {[1,2,3,4].map(i => <div key={i} className="h-24 bg-slate-800 rounded-xl" />)}
        </div>
        {[1,2,3].map(i => <div key={i} className="h-20 bg-slate-800 rounded-xl" />)}
      </div>
    </div>
  )
}
