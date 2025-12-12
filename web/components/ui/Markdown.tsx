"use client";

import ReactMarkdown from "react-markdown";

type MarkdownProps = {
  content: string;
  className?: string;
};

export default function Markdown({ content, className = "" }: MarkdownProps) {
  return (
    <div className={`report-content ${className}`}>
      <ReactMarkdown>{content}</ReactMarkdown>
    </div>
  );
}
