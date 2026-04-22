import { useQuery } from "convex/react";
import { Navigate, useParams } from "react-router-dom";
import { api, type Id } from "@/api";
import { LoadingIndicator } from "@/components/application/loading-indicator/loading-indicator";

/**
 * Redirects the legacy flat URL `/positions/:positionId` to the nested
 * shape `/themes/:themeId/positions/:positionId`.
 *
 * We look up the position to get its themeId, then `<Navigate replace>` so
 * back-button history stays clean.
 */
export default function PositionRedirect() {
  const { positionId } = useParams<{ positionId: string }>();
  const positionDetail = useQuery(
    api.positions.getPositionDetail,
    positionId ? { positionId: positionId as Id<"researchPositions"> } : "skip",
  );

  if (!positionId) return <Navigate to="/" replace />;

  if (positionDetail === undefined) {
    return (
      <div className="flex min-h-[24rem] items-center justify-center">
        <LoadingIndicator type="line-simple" size="lg" label="Loading position" />
      </div>
    );
  }

  if (positionDetail === null || !positionDetail.theme) {
    return <Navigate to="/" replace />;
  }

  return (
    <Navigate
      to={`/themes/${positionDetail.theme._id}/positions/${positionId}`}
      replace
    />
  );
}
