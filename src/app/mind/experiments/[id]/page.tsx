import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
import { ExperimentDetail } from "@/components/mind/experiment-detail";

export const dynamic = "force-dynamic";

export default async function ExperimentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const experiment = await prisma.experiment.findUnique({
    where: { id },
    include: {
      logs: { orderBy: { day: "desc" } },
      tags: { orderBy: { timestamp: "desc" }, take: 20 },
    },
  });

  if (!experiment) notFound();

  const treatmentCount = experiment.logs.filter((l) => l.independentValue).length;
  const controlCount = experiment.logs.filter((l) => !l.independentValue).length;

  return (
    <ExperimentDetail
      experiment={{
        ...experiment,
        startDate: experiment.startDate.toISOString(),
        endDate: experiment.endDate?.toISOString() ?? null,
        createdAt: experiment.createdAt.toISOString(),
        updatedAt: experiment.updatedAt.toISOString(),
        logs: experiment.logs.map((l) => ({
          ...l,
          day: l.day.toISOString(),
          createdAt: l.createdAt.toISOString(),
        })),
        tags: experiment.tags.map((t) => ({
          ...t,
          timestamp: t.timestamp.toISOString(),
          createdAt: t.createdAt.toISOString(),
        })),
      }}
      treatmentCount={treatmentCount}
      controlCount={controlCount}
    />
  );
}
