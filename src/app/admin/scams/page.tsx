"use client";

import React from "react";
import {
  Radar,
  ShieldAlert,
  AlertTriangle,
  Clock,
  Sparkles,
  Lock,
  Layers,
  CheckCircle2,
  ThumbsUp,
  ThumbsDown,
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { initialScamCategories } from "@/lib/seed-data";

const confidenceDistribution = [
  { name: "High Concern (Scam)", value: 685, color: "#f06a6a" },
  { name: "Medium Suspicion", value: 165, color: "#f59e0b" },
  { name: "Low Risk Detected", value: 50, color: "#34d399" },
];

const dailyVolume = [
  { day: "Oct 06", count: 48 },
  { day: "Oct 08", count: 56 },
  { day: "Oct 10", count: 62 },
  { day: "Oct 12", count: 71 },
  { day: "Oct 14", count: 68 },
  { day: "Oct 16", count: 79 },
  { day: "Oct 18", count: 85 },
];

export default function ScamIntelligencePage() {
  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-[#eaf1f7]">
              AI scam intelligence & threat feed
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs bg-[#13203a] text-[#8ea0b3] border border-[#1f2d45]">
              M5-04 · X-13
            </span>
          </div>
          <p className="text-xs text-[#8ea0b3] mt-1">
            Aggregated threat patterns, category distribution, and AI confidence telemetry from M4.
          </p>
        </div>
      </div>

      {/* Privacy Non-Negotiable Alert Banner */}
      <div className="p-4 rounded-xl bg-[#13203a] border border-[#2dd4bf]/40 flex items-start gap-3 text-xs">
        <Lock className="w-5 h-5 text-[#2dd4bf] flex-shrink-0 mt-0.5" />
        <div className="space-y-1">
          <div className="font-semibold text-[#eaf1f7]">Privacy Boundary 2 Enforced</div>
          <p className="text-[#8ea0b3] leading-relaxed">
            Raw email text, SMS messages, phone numbers, and extracted contacts are strictly prohibited from reaching analytics or the admin database. Only sanitized taxonomy tags (`X-13`), timestamps, and categorical verdicts are monitored here.
          </p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 rounded-xl bg-[#0e1726] border border-[#1f2d45] space-y-2">
          <div className="flex items-center justify-between text-xs text-[#8ea0b3]">
            <span>Total Messages Checked</span>
            <Radar className="w-4 h-4 text-[#2dd4bf]" />
          </div>
          <div className="text-3xl font-bold text-[#eaf1f7]">900</div>
          <div className="text-xs text-[#34d399]">100% processed server-side</div>
        </div>

        <div className="p-5 rounded-xl bg-[#0e1726] border border-[#1f2d45] space-y-2">
          <div className="flex items-center justify-between text-xs text-[#8ea0b3]">
            <span>Top Threat Vector</span>
            <ShieldAlert className="w-4 h-4 text-[#f06a6a]" />
          </div>
          <div className="text-2xl font-bold text-[#eaf1f7]">Phishing (45.5%)</div>
          <div className="text-xs text-[#8ea0b3]">410 credential theft attempts</div>
        </div>

        <div className="p-5 rounded-xl bg-[#0e1726] border border-[#1f2d45] space-y-2">
          <div className="flex items-center justify-between text-xs text-[#8ea0b3]">
            <span>Avg Pipeline Latency</span>
            <Clock className="w-4 h-4 text-[#2dd4bf]" />
          </div>
          <div className="text-3xl font-bold text-[#eaf1f7]">1.4s</div>
          <div className="text-xs text-[#34d399]">5-stage pipeline response</div>
        </div>

        <div className="p-5 rounded-xl bg-[#0e1726] border border-[#1f2d45] space-y-2">
          <div className="flex items-center justify-between text-xs text-[#8ea0b3]">
            <span>User Verdict Agreement</span>
            <ThumbsUp className="w-4 h-4 text-[#34d399]" />
          </div>
          <div className="text-3xl font-bold text-[#eaf1f7]">91.2%</div>
          <div className="text-xs text-[#8ea0b3]">Positive user feedback rate</div>
        </div>
      </div>

      {/* Row 2: Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Category Volume Chart */}
        <div className="lg:col-span-7 p-5 rounded-xl bg-[#0e1726] border border-[#1f2d45] space-y-4">
          <h2 className="text-sm font-semibold text-[#eaf1f7]">Threat Volume by Taxonomy (X-13)</h2>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={initialScamCategories}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2d45" vertical={false} />
                <XAxis dataKey="category" stroke="#8ea0b3" tickLine={false} fontSize={11} />
                <YAxis stroke="#8ea0b3" tickLine={false} fontSize={11} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#13203a",
                    borderColor: "#1f2d45",
                    borderRadius: "8px",
                    color: "#eaf1f7",
                    fontSize: "12px",
                  }}
                />
                <Bar dataKey="count" fill="#2dd4bf" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* AI Confidence Distribution */}
        <div className="lg:col-span-5 p-5 rounded-xl bg-[#0e1726] border border-[#1f2d45] space-y-4">
          <h2 className="text-sm font-semibold text-[#eaf1f7]">AI Confidence Breakdown</h2>
          <div className="h-52 w-full flex items-center justify-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={confidenceDistribution}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={75}
                  paddingAngle={4}
                >
                  {confidenceDistribution.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#13203a",
                    borderColor: "#1f2d45",
                    borderRadius: "8px",
                    color: "#eaf1f7",
                    fontSize: "12px",
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className="space-y-1.5 pt-1 text-xs">
            {confidenceDistribution.map((item) => (
              <div key={item.name} className="flex items-center justify-between text-[#8ea0b3]">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                  <span className="text-[#eaf1f7]">{item.name}</span>
                </div>
                <span className="font-semibold text-[#eaf1f7]">
                  {item.value} ({Math.round((item.value / 900) * 100)}%)
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Row 3: Official Taxonomy Mapping Details */}
      <div className="p-5 rounded-xl bg-[#0e1726] border border-[#1f2d45] space-y-4">
        <h2 className="text-sm font-semibold text-[#eaf1f7]">
          Shared Taxonomy Contract Specifications (X-13)
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-[#1f2d45] text-[#8ea0b3] bg-[#0b1322]">
                <th className="py-3 px-4 font-medium">Category Code</th>
                <th className="py-3 px-4 font-medium">Label</th>
                <th className="py-3 px-4 font-medium">Checks Recorded</th>
                <th className="py-3 px-4 font-medium">High Risk Ratio</th>
                <th className="py-3 px-4 font-medium">Standard Guidance Provided</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1f2d45]">
              <tr className="hover:bg-[#13203a]/50">
                <td className="py-3 px-4 font-mono text-[#2dd4bf]">CAT-PHISH</td>
                <td className="py-3 px-4 font-medium text-[#eaf1f7]">Phishing / Impersonation</td>
                <td className="py-3 px-4">410 checks</td>
                <td className="py-3 px-4 font-semibold text-[#f06a6a]">83.4% high risk</td>
                <td className="py-3 px-4 text-[#8ea0b3]">Sri Lanka CERT + Direct Bank helpline</td>
              </tr>
              <tr className="hover:bg-[#13203a]/50">
                <td className="py-3 px-4 font-mono text-[#2dd4bf]">CAT-JOB</td>
                <td className="py-3 px-4 font-medium text-[#eaf1f7]">Employment / Fee Scam</td>
                <td className="py-3 px-4">230 checks</td>
                <td className="py-3 px-4 font-semibold text-[#f06a6a]">86.1% high risk</td>
                <td className="py-3 px-4 text-[#8ea0b3]">Labor department fraud warnings</td>
              </tr>
              <tr className="hover:bg-[#13203a]/50">
                <td className="py-3 px-4 font-mono text-[#2dd4bf]">CAT-PARCEL</td>
                <td className="py-3 px-4 font-medium text-[#eaf1f7]">Delivery / Parcel Scam</td>
                <td className="py-3 px-4">170 checks</td>
                <td className="py-3 px-4 font-semibold text-[#f06a6a]">85.3% high risk</td>
                <td className="py-3 px-4 text-[#8ea0b3]">Postal agency verification guidelines</td>
              </tr>
              <tr className="hover:bg-[#13203a]/50">
                <td className="py-3 px-4 font-mono text-[#2dd4bf]">CAT-OTHER</td>
                <td className="py-3 px-4 font-medium text-[#eaf1f7]">Other / Limited Assessment</td>
                <td className="py-3 px-4">90 checks</td>
                <td className="py-3 px-4 font-semibold text-[#f59e0b]">46.7% ambiguous</td>
                <td className="py-3 px-4 text-[#8ea0b3]">Caution guidelines + do not reply</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
