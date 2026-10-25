import Link from "next/link";

export default function PatientNotFound() {
  return (
    <div className="empty-state" role="alert">
      <h1 style={{ fontSize: "var(--step-2)" }}>Record not found</h1>
      <p>This record does not exist or is outside your assigned camps.</p>
      <Link href="/workspace/patients" className="btn btn-primary">Back to participants</Link>
    </div>
  );
}
