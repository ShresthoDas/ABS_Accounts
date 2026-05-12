import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface IncomeData {
  date: string;
  receiptNumber: string;
  name: string;
  mobileNumber?: string | null;
  panNumber: string;
  amount: number;
  category: string;
  modeOfPayment: string;
  chequeNumber?: string | null;
  inputBy: string;
  createdBy?: string;
  createdAt?: string;
}

export const generateReceiptPDF = (incomeData: IncomeData) => {
  const doc = new jsPDF();
  
  // Set up colors
  const primaryColor: [number, number, number] = [59, 130, 246]; // Blue
  const secondaryColor: [number, number, number] = [107, 114, 128]; // Gray
  const accentColor: [number, number, number] = [34, 197, 94]; // Green
  
  // Header - Organization Info
  doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.rect(0, 0, 210, 40, 'F');
  
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(24);
  doc.setFont('helvetica', 'bold');
  doc.text('ABS ACCOUNTS', 105, 20, { align: 'center' });
  
  doc.setFontSize(12);
  doc.setFont('helvetica', 'normal');
  doc.text('Income Receipt', 105, 30, { align: 'center' });
  
  // Reset text color
  doc.setTextColor(0, 0, 0);
  
  // Receipt Number and Date
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text(`Receipt No: ${incomeData.receiptNumber}`, 20, 55);
  
  doc.setFont('helvetica', 'normal');
  const formattedDate = new Date(incomeData.date).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  });
  doc.text(`Date: ${formattedDate}`, 150, 55, { align: 'right' });
  
  // Donor Information Section
  doc.setFillColor(243, 244, 246);
  doc.rect(20, 65, 170, 8, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text("Donor Information", 25, 71);
  
  // Donor details
  const startY = 80;
  const lineHeight = 10;
  
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  
  // Name
  doc.setFont('helvetica', 'bold');
  doc.text("Name:", 25, startY);
  doc.setFont('helvetica', 'normal');
  doc.text(incomeData.name, 65, startY);
  
  // PAN Number
  doc.setFont('helvetica', 'bold');
  doc.text("PAN Number:", 25, startY + lineHeight);
  doc.setFont('helvetica', 'normal');
  doc.text(incomeData.panNumber, 65, startY + lineHeight);
  
  // Mobile Number (if available)
  if (incomeData.mobileNumber) {
    doc.setFont('helvetica', 'bold');
    doc.text("Mobile:", 25, startY + lineHeight * 2);
    doc.setFont('helvetica', 'normal');
    doc.text(incomeData.mobileNumber, 65, startY + lineHeight * 2);
  }
  
  // Payment Details Section
  const paymentSectionY = startY + lineHeight * 3 + 10;
  
  doc.setFillColor(243, 244, 246);
  doc.rect(20, paymentSectionY, 170, 8, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text("Payment Details", 25, paymentSectionY + 6);
  
  // Payment details table
  const tableY = paymentSectionY + 15;
  
  autoTable(doc, {
    startY: tableY,
    head: [['Field', 'Details']],
    body: [
      ['Category', incomeData.category],
      ['Amount', `₹ ${incomeData.amount.toLocaleString('en-IN', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      })}`],
      ['Mode of Payment', incomeData.modeOfPayment],
      ...(incomeData.chequeNumber ? [[incomeData.modeOfPayment === 'Cheque' ? 'Cheque' : 'Reference', incomeData.chequeNumber]] as string[][] : []),
    ],
    theme: 'striped',
    headStyles: { fillColor: primaryColor },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 60 },
      1: { cellWidth: 120 }
    },
    margin: { left: 20, right: 20 },
  });
  
  // Amount in words (final Y position from autoTable)
  const finalY = (doc as any).lastAutoTable.finalY + 15;
  
  // Amount in words
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(11);
  doc.text(`Amount in Words: ${amountInWords(incomeData.amount)}`, 20, finalY);
  
  // Footer section
  const footerY = finalY + 20;
  
  // Line for signature
  doc.setDrawColor(secondaryColor[0], secondaryColor[1], secondaryColor[2]);
  doc.line(120, footerY, 190, footerY);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(secondaryColor[0], secondaryColor[1], secondaryColor[2]);
  doc.text("Authorized Signatory", 155, footerY + 5, { align: 'center' });
  
  // Input By info
  doc.setFontSize(9);
  doc.text(`Entered by: ${incomeData.inputBy}`, 20, footerY + 5);
  
  // Footer
  const pageHeight = doc.internal.pageSize.height;
  doc.setFontSize(8);
  doc.setTextColor(156, 163, 175);
  doc.text("This is a computer-generated receipt and does not require a physical signature.", 105, pageHeight - 15, { align: 'center' });
  doc.text("For any queries, please contact ABS Accounts Department.", 105, pageHeight - 10, { align: 'center' });
  
  // Save the PDF
  const fileName = `Receipt_${incomeData.receiptNumber.replace(/\//g, '_')}_${incomeData.name.replace(/\s+/g, '_')}.pdf`;
  doc.save(fileName);
  
  return doc;
};

// Helper function to convert amount to words
function amountInWords(amount: number): string {
  const rupees = Math.floor(amount);
  const paise = Math.round((amount - rupees) * 100);
  
  let words = '';
  
  if (rupees === 0) {
    words = 'Zero Rupees';
  } else {
    words = numberToWords(rupees) + ' Rupee' + (rupees !== 1 ? 's' : '');
  }
  
  if (paise > 0) {
    words += ' and ' + numberToWords(paise) + ' Paise';
  }
  
  return words + ' Only';
}

function numberToWords(num: number): string {
  if (num === 0) return 'Zero';
  
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
                'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 
                'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  
  if (num < 20) return ones[num];
  
  let result = '';
  
  if (num >= 10000000) {
    const crores = Math.floor(num / 10000000);
    result += numberToWords(crores) + ' Crore ';
    num %= 10000000;
  }
  
  if (num >= 100000) {
    const lakhs = Math.floor(num / 100000);
    result += numberToWords(lakhs) + ' Lakh ';
    num %= 100000;
  }
  
  if (num >= 1000) {
    const thousands = Math.floor(num / 1000);
    result += numberToWords(thousands) + ' Thousand ';
    num %= 1000;
  }
  
  if (num >= 100) {
    const hundreds = Math.floor(num / 100);
    result += numberToWords(hundreds) + ' Hundred ';
    num %= 100;
  }
  
  if (num > 0) {
    if (num < 20) {
      result += ones[num];
    } else {
      const ten = Math.floor(num / 10);
      const one = num % 10;
      result += tens[ten];
      if (one > 0) {
        result += ' ' + ones[one];
      }
    }
  }
  
  return result.trim();
}