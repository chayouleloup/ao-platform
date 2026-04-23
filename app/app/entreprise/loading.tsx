export default function Loading() {
  return (
    <div className="p-8">
      <div className="animate-pulse space-y-4">
        <div className="h-8 bg-slate-800 rounded-xl w-56" />
        <div className="grid grid-cols-3 gap-4">
          {[1,2,3,4,5,6].map(i => <div key={i} className="h-32 bg-slate-800 rounded-xl" />)}
        </div>
      </div>
    </div>
  )
}
