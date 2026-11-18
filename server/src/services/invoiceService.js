import PDFDocument from "pdfkit";
import { ApiError } from "../utils/ApiError.js";
const amount = (value) => `INR ${(value / 100).toFixed(2)}`;
const createInvoice = (order) => {
  if (order.paymentStatus !== "paid")
    throw new ApiError(
      409,
      "INVOICE_NOT_AVAILABLE",
      "Invoices are available after payment is confirmed.",
    );
  const doc = new PDFDocument({
    size: "A4",
    margin: 48,
    info: { Title: `Marketplace invoice ${order._id}` },
  });
  const bottom = doc.page.height - 65;
  const ensureSpace = (height) => {
    if (doc.y + height > bottom) doc.addPage();
  };
  doc.fontSize(22).text("Marketplace");
  doc.moveDown(0.4).fontSize(12).text("TEST PAYMENT INVOICE");
  doc.moveDown().fontSize(10).text(`Invoice: MP-${order._id}`);
  doc.text(`Paid: ${new Date(order.paidAt).toISOString().slice(0, 10)}`);
  doc.text(`Currency: INR | Payment: ${order.paymentId}`);
  doc.moveDown().fontSize(12).text("Deliver to");
  doc
    .fontSize(10)
    .text(
      [
        order.address.name,
        order.address.line1,
        order.address.line2,
        `${order.address.city}, ${order.address.state} ${order.address.postalCode}`,
        "India",
        order.address.phone,
      ]
        .filter(Boolean)
        .join("\n"),
    );
  doc.moveDown().fontSize(12).text("Items").moveDown(0.5);
  for (const line of order.lines) {
    const title = `${line.title}\n${line.storeName}`;
    const height = Math.max(
      42,
      doc.fontSize(10).heightOfString(title, { width: 235 }) + 16,
    );
    ensureSpace(height);
    const y = doc.y;
    doc.fontSize(10).text(title, 48, y, { width: 235 });
    doc.text(`${line.quantity} x ${amount(line.unitPriceInPaise)}`, 295, y, {
      width: 120,
    });
    doc.text(amount(line.totalInPaise), 425, y, { width: 120, align: "right" });
    doc.y = y + height;
    doc
      .moveTo(48, doc.y - 5)
      .lineTo(547, doc.y - 5)
      .strokeColor("#dddddd")
      .stroke();
  }
  ensureSpace(150);
  doc.x = 48;
  doc
    .moveDown()
    .fontSize(11)
    .text(`Subtotal: ${amount(order.subtotalInPaise)}`, { align: "right" });
  doc.text(
    `Discount${order.couponCode ? ` (${order.couponCode})` : ""}: -${amount(order.discountInPaise)}`,
    { align: "right" },
  );
  doc
    .fontSize(14)
    .text(`Total paid: ${amount(order.totalInPaise)}`, { align: "right" });
  doc
    .moveDown()
    .fontSize(9)
    .fillColor("#555555")
    .text(
      "Razorpay test mode. No real money was charged. This project invoice is not a GST tax invoice.",
      { align: "left" },
    );
  return doc;
};
export { createInvoice };
