import { Clock, Pencil, PlayCircle } from "lucide-react";
import { Link } from "react-router-dom";

const avatarColors = {
  research: "bg-blue-500",
  writing: "bg-purple-500",
  data: "bg-emerald-500",
  support: "bg-orange-500",
  code: "bg-cyan-500",
  meeting: "bg-pink-500",
};

export default function AgentCard({ agent }) {
  if (!agent) {
    return (
      <div className="bg-[#1A1D27] border border-[#2A2D3E] rounded-2xl p-6">
        <div className="text-[#9CA3AF] text-sm">
          No agent data available.
        </div>
      </div>
    );
  }

  const statusStyles = {
    Active: "bg-green-500/10 text-green-400 border border-green-500/20",
    Paused: "bg-yellow-500/10 text-yellow-400 border border-yellow-500/20",
    Draft: "bg-gray-500/10 text-gray-400 border border-gray-500/20",
  };

  const avatarColor =
    avatarColors[agent.category] || "bg-[#7C3AED]";

  return (
    <div
      className="
        bg-[#1A1D27]
        border
        border-[#2A2D3E]
        rounded-2xl
        p-5
        transition-all
        duration-150
        hover:border-[#7C3AED]
        hover:scale-[1.01]
      "
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <div
            className={`w-12 h-12 rounded-full flex items-center justify-center text-white font-bold ${avatarColor}`}
          >
            {agent.initials}
          </div>

          <div>
            <h3 className="text-[14px] font-bold text-white">
              {agent.name}
            </h3>

            <p className="text-[12px] text-[#9CA3AF] mt-1 line-clamp-1">
              {agent.description}
            </p>
          </div>
        </div>
      </div>

      {/* Status */}
      <div className="mb-4">
        <span
          className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${statusStyles[agent.status]}`}
        >
          {agent.status}
        </span>
      </div>

      {/* Last Run */}
      <div className="text-[12px] text-[#9CA3AF] mb-5">
        Last run: {agent.lastRun}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        <Link
          to={`/agents/${agent.id}/run`}
          className="
            flex-1
            flex
            items-center
            justify-center
            gap-2
            bg-[#7C3AED]
            hover:bg-[#6D28D9]
            text-white
            rounded-xl
            py-2.5
            transition-all
            duration-150
          "
        >
          <PlayCircle size={16} />
          <span className="text-sm">Run</span>
        </Link>

        <button
          className="
            w-10
            h-10
            rounded-xl
            border
            border-[#2A2D3E]
            hover:border-[#7C3AED]
            flex
            items-center
            justify-center
            text-[#9CA3AF]
            hover:text-white
            transition-all
            duration-150
          "
          title="Edit Agent"
        >
          <Pencil size={16} />
        </button>

        <Link
          to={`/agents/${agent.id}/runs`}
          className="
            w-10
            h-10
            rounded-xl
            border
            border-[#2A2D3E]
            hover:border-[#7C3AED]
            flex
            items-center
            justify-center
            text-[#9CA3AF]
            hover:text-white
            transition-all
            duration-150
          "
          title="Run History"
        >
          <Clock size={16} />
        </Link>
      </div>
    </div>
  );
}