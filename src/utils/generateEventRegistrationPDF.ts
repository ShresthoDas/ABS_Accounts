import jsPDF from "jspdf";

interface EventRegistrationPDFData {
  registrationKey: string;
  date: string;
  userType: string;
  memberId: string | null;
  name: string | null;
  mobileNumber: string | null;
  eventName: string;
  numberOfMembers: number;
  tokens: string[];
}

export const generateEventRegistrationPDF = (registration: EventRegistrationPDFData) => {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const left = 18;
  const right = pageWidth - left;
  const valueWidth = pageWidth - 70;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("AGRADOOT BANGOSAMAJ", pageWidth / 2, 22, { align: "center" });
  doc.setFontSize(13);
  doc.text("EVENT REGISTRATION", pageWidth / 2, 32, { align: "center" });

  doc.setDrawColor(37, 99, 235);
  doc.setLineWidth(0.7);
  doc.line(left, 39, right, 39);

  let y = 52;
  const details: [string, string][] = [
    ["Registration ID", registration.registrationKey || "-"],
    ["Date", new Date(registration.date).toLocaleDateString("en-IN")],
    ["Participant Type", registration.userType === "member" ? "Member" : "Non-Member"],
    ["Member ID", registration.memberId || "-"],
    ["Name", registration.name || "-"],
    ...(registration.mobileNumber ? [["Mobile Number", registration.mobileNumber] as [string, string]] : []),
    ["Event", registration.eventName],
    ["Number of Members", String(registration.numberOfMembers)],
  ];

  details.forEach(([label, value]) => {
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text(`${label}:`, left, y);
    doc.setFont("helvetica", "normal");
    const lines = doc.splitTextToSize(value, valueWidth);
    doc.text(lines, 62, y);
    y += Math.max(8, lines.length * 5 + 2);
  });

  y += 6;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("TOKEN NUMBERS", left, y);
  y += 9;

  doc.setFont("courier", "bold");
  doc.setFontSize(14);
  registration.tokens.forEach((token) => {
    if (y > doc.internal.pageSize.getHeight() - 20) {
      doc.addPage();
      y = 22;
    }
    doc.text(token, left, y);
    y += 9;
  });

  doc.save(`event-registration-${registration.registrationKey || Date.now()}.pdf`);
};