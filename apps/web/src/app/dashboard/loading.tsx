import { Skeleton } from "@/components/ui/skeleton";

export default function DashboardLoading() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-64" />
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className={`h-20 rounded-lg ${i === 4 ? "hidden sm:block" : ""}`} />
        ))}
      </div>
      <Skeleton className="h-96 rounded-lg" />
    </div>
  );
}
