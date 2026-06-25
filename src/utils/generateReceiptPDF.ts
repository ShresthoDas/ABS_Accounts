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
  referredBy?: string | null;
}

// Convert image to base64 for use in PDF
function getBase64Image(img: HTMLImageElement): string {
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d');
  ctx!.drawImage(img, 0, 0);
  const dataURL = canvas.toDataURL('image/jpeg');
  return dataURL;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

export const generateReceiptPDF = async (incomeData: IncomeData) => {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.width;
  const pageHeight = doc.internal.pageSize.height;

  // Colors
  const accentColor: [number, number, number] = [37, 99, 235]; // Blue
  const grayColor: [number, number, number] = [107, 114, 128];
  const lightGray: [number, number, number] = [249, 250, 251];
  const borderColor: [number, number, number] = [209, 213, 219];

  // Add logo as watermark background with reduced opacity
  try {
    const img = await loadImage('/abslogo.jpg');
    // Create a white-background canvas, then draw logo at low opacity
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = img.width;
    tempCanvas.height = img.height;
    const tempCtx = tempCanvas.getContext('2d')!;
    // Fill with white background first (JPEG doesn't support transparency)
    tempCtx.fillStyle = '#ffffff';
    tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
    // Draw logo at low opacity
    tempCtx.globalAlpha = 0.2;
    tempCtx.drawImage(img, 0, 0);
    const watermarkedData = tempCanvas.toDataURL('image/jpeg');
    // Place logo as a centered watermark across the entire page
    const watermarkWidth = 160;
    const watermarkHeight = (img.height / img.width) * watermarkWidth;
    const xPos = (pageWidth - watermarkWidth) / 2;
    const yPos = (pageHeight - watermarkHeight) / 2;
    doc.addImage(watermarkedData, 'JPEG', xPos, yPos, watermarkWidth, watermarkHeight);
  } catch (e) {
    // Logo not available, continue without watermark
  }

  // Header - Organization Name (no background, just text)
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.text('AGRADOOT BANGOSAMAJ', pageWidth / 2, 18, { align: 'center' });

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text('OFFICIAL RECEIPT', pageWidth / 2, 26, { align: 'center' });

  // Divider line below header
  doc.setDrawColor(accentColor[0], accentColor[1], accentColor[2]);
  doc.setLineWidth(0.8);
  doc.line(14, 32, pageWidth - 14, 32);

  // Receipt Number and Date - horizontal layout in a card-like box
  const receiptBoxY = 40;
  doc.setFillColor(lightGray[0], lightGray[1], lightGray[2]);
  doc.setDrawColor(borderColor[0], borderColor[1], borderColor[2]);
  doc.setLineWidth(0.3);
  doc.roundedRect(14, receiptBoxY, pageWidth - 28, 14, 2, 2, 'FD');

  doc.setTextColor(0, 0, 0);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text(`Receipt No: ${incomeData.receiptNumber}`, 20, receiptBoxY + 10);

  const formattedDate = new Date(incomeData.date).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  });
  doc.setFont('helvetica', 'normal');
  doc.text(`Date: ${formattedDate}`, pageWidth - 20, receiptBoxY + 10, { align: 'right' });

  // Donor Information Section with table
  const donorSectionY = receiptBoxY + 22;

  // Section heading
  doc.setFillColor(accentColor[0], accentColor[1], accentColor[2]);
  doc.rect(14, donorSectionY, pageWidth - 28, 9, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('DONOR INFORMATION', 20, donorSectionY + 6.5);

  // Donor Details Table
  const donorTableRows: string[][] = [
    ['Name', incomeData.name],
    ['PAN Number', incomeData.panNumber || '-'],
  ];

  if (incomeData.mobileNumber) {
    donorTableRows.push(['Mobile', incomeData.mobileNumber]);
  }


  doc.setTextColor(0, 0, 0);
  autoTable(doc, {
    startY: donorSectionY + 9,
    body: donorTableRows,
    theme: 'grid',
    tableLineColor: borderColor,
    tableLineWidth: 0.3,
    bodyStyles: { fontSize: 10, cellPadding: 3 },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 40, fillColor: [243, 244, 246] },
      1: { cellWidth: 'auto' },
    },
    margin: { left: 14, right: 14 },
    styles: {
      lineColor: borderColor,
      lineWidth: 0.3,
    },
  });

  const afterDonorY = (doc as any).lastAutoTable.finalY + 10;

  // Payment Details Section
  doc.setFillColor(accentColor[0], accentColor[1], accentColor[2]);
  doc.rect(14, afterDonorY, pageWidth - 28, 9, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('PAYMENT DETAILS', 20, afterDonorY + 6.5);

  // Payment Details Table
  const paymentRows: string[][] = [
    ['Category', incomeData.category],
    ['Amount', `Rs ${incomeData.amount.toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    })}`],
    ['Mode of Payment', incomeData.modeOfPayment],
  ];

  if (incomeData.chequeNumber) {
    paymentRows.push([
      incomeData.modeOfPayment === 'Cheque' ? 'Cheque Number' : 'Reference Number',
      incomeData.chequeNumber
    ]);
  }

  doc.setTextColor(0, 0, 0);
  autoTable(doc, {
    startY: afterDonorY + 9,
    body: paymentRows,
    theme: 'grid',
    tableLineColor: borderColor,
    tableLineWidth: 0.3,
    bodyStyles: { fontSize: 10, cellPadding: 3 },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 40, fillColor: [243, 244, 246] },
      1: { cellWidth: 'auto' },
    },
    margin: { left: 14, right: 14 },
    styles: {
      lineColor: borderColor,
      lineWidth: 0.3,
    },
  });

  const afterPaymentY = (doc as any).lastAutoTable.finalY + 8;

  // Amount in words
  doc.setFillColor(lightGray[0], lightGray[1], lightGray[2]);
  doc.setDrawColor(borderColor[0], borderColor[1], borderColor[2]);
  doc.setLineWidth(0.3);
  doc.roundedRect(14, afterPaymentY, pageWidth - 28, 14, 2, 2, 'FD');

  doc.setTextColor(0, 0, 0);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('Amount in Words:', 20, afterPaymentY + 6);

  doc.setFont('helvetica', 'italic');
  doc.setFontSize(10);
  doc.text(amountInWords(incomeData.amount), 20, afterPaymentY + 12);

  // Meta information
  let metaY = afterPaymentY + 22;
  doc.setFontSize(8);
  doc.setTextColor(grayColor[0], grayColor[1], grayColor[2]);
  doc.setFont('helvetica', 'normal');
  
  if (incomeData.referredBy) {
    doc.text(`Referred By: ${incomeData.referredBy}`, 14, metaY);
    metaY += 6;
  }

  doc.text(`Generated by: ${incomeData.inputBy}`, 14, metaY);

  // Footer
  doc.setDrawColor(borderColor[0], borderColor[1], borderColor[2]);
  doc.setLineWidth(0.3);
  doc.line(14, pageHeight - 22, pageWidth - 14, pageHeight - 22);

  doc.setFontSize(7.5);
  doc.setTextColor(grayColor[0], grayColor[1], grayColor[2]);
  doc.setFont('helvetica', 'normal');
  doc.text('This is a computer-generated receipt and does not require a physical signature.', pageWidth / 2, pageHeight - 16, { align: 'center' });
  doc.text('For any queries, please contact Agradoot Bangosamaj Accounts Department.', pageWidth / 2, pageHeight - 11, { align: 'center' });

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