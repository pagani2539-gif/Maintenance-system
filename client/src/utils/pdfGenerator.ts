export const printElement = (elementId: string, title: string) => {
  const element = document.getElementById(elementId);
  if (!element) {
    console.error('Print element not found');
    return;
  }

  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    alert('กรุณาอนุญาตให้เปิด Pop-up window เพื่อพิมพ์ใบงาน\\n(Allow pop-up in your browser)');
    return;
  }

  printWindow.document.write('<!DOC' + 'TYPE html>\n' + `
<html lang="th">
<head>
  <meta charset="UTF-8">
  <title>${title}</title>
  <link href="https://fonts.googleapis.com/css2?family=Bai+Jamjuree:wght@400;500;600;700&family=Sarabun:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    @page { 
      size: A4 portrait; 
      margin: 0; 
    }
    html, body {
      font-family: 'Sarabun', sans-serif;
      margin: 0; padding: 0;
      width: 100%;
      background: #fff;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    * { box-sizing: border-box; }
    
    #pdf-print-template, #pdf-withdrawal-template, #pdf-return-template, #pdf-po-template {
      position: relative !important;
      left: 0 !important;
      top: 0 !important;
      display: block !important;
      width: 100% !important;
      height: auto !important;
      max-height: none !important;
      padding: 0 !important;
      box-shadow: none !important;
    }

    #report-print-container {
      position: relative !important;
      left: 0 !important;
      top: 0 !important;
      display: block !important;
      width: 100% !important;
      height: auto !important;
      max-height: none !important;
      padding: 0 !important;
      box-shadow: none !important;
    }

    /* Override page dimensions for multi-page templates to fit A4 layout and avoid trailing blank pages */
    .print-page, .pdf-page {
      position: relative !important;
      left: 0 !important;
      top: 0 !important;
      width: 100% !important;
      min-height: 297mm !important;
      height: auto !important;
      margin: 0 !important;
      box-shadow: none !important;
      page-break-after: always;
      break-after: page;
    }
    .print-page:last-child, .pdf-page:last-child {
      page-break-after: avoid !important;
      break-after: avoid !important;
    }

    /* Prevent rows from breaking across pages */
    tr {
      page-break-inside: avoid !important;
      break-inside: avoid !important;
    }

    /* Avoid breaking cards or signature sections */
    .print-card, [style*="grid-template-columns"] {
      page-break-inside: avoid !important;
      break-inside: avoid !important;
    }

    /* Ensure table headers repeat if possible (browser dependent) */
    thead { display: table-header-group; }
    tfoot { display: table-footer-group; }
  </style>
</head>
<body>
  ${element.outerHTML}
</body>
</html>`);

  printWindow.document.close();
  printWindow.focus();

  // Wait for fonts/images to load then print
  setTimeout(() => {
    printWindow.print();
    printWindow.close();
  }, 800);
};
