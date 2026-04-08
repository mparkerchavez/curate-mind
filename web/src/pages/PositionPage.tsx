import { useParams } from "react-router-dom";
import { Id } from "../api";
import LineageView from "../components/LineageView";

export default function PositionPage() {
  const { positionId } = useParams<{ positionId: string }>();
  if (!positionId) return null;
  return (
    <div className="mx-auto max-w-6xl px-6 py-16 md:px-10">
      <LineageView positionId={positionId as Id<"researchPositions">} />
    </div>
  );
}
