// Mide el blanco inferior de cada página de un PDF y el número de páginas.
//
// Uso: swift pdf-blanco.swift <archivo.pdf> [franja_pie]
//   franja_pie: fracción inferior de la página que se ignora (número de página, pie).
//   Por defecto 0.05 (5 %). Usa 0 si el PDF no lleva numeración.
import PDFKit
import CoreGraphics

let args = CommandLine.arguments
guard args.count >= 2, let doc = PDFDocument(url: URL(fileURLWithPath: args[1])) else {
  print("Uso: swift pdf-blanco.swift <archivo.pdf> [franja_pie]")
  exit(1)
}
let franja = args.count >= 3 ? (Double(args[2]) ?? 0.05) : 0.05
print("páginas: \(doc.pageCount)")
for i in 0..<doc.pageCount {
  let page = doc.page(at: i)!
  let b = page.bounds(for: .mediaBox)
  let w = Int(b.width), h = Int(b.height)
  var data = [UInt8](repeating: 0, count: w * h * 4)
  let ctx = CGContext(data: &data, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w * 4,
                      space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
  ctx.setFillColor(CGColor(red: 1, green: 1, blue: 1, alpha: 1))
  ctx.fill(CGRect(x: 0, y: 0, width: w, height: h))
  page.draw(with: .mediaBox, to: ctx)
  // Fila 0 del buffer = parte superior de la página renderizada
  let limite = Int(Double(h) * (1 - franja))
  var ultimaConTinta = 0
  for y in 0..<limite {
    for x in stride(from: 0, to: w, by: 2) {
      let o = (y * w + x) * 4
      if data[o] < 240 || data[o + 1] < 240 || data[o + 2] < 240 { ultimaConTinta = y; break }
    }
  }
  let blanco = Int(Double(limite - 1 - ultimaConTinta) / Double(h) * 100)
  print("página \(i + 1): \(blanco) % en blanco al pie\(blanco >= 60 ? "  ⚠ casi vacía" : "")")
}
