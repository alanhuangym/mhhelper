from flask import Flask, request, jsonify
from rapidocr_onnxruntime import RapidOCR
import os

app = Flask(__name__)
engine = RapidOCR()


@app.route("/ocr", methods=["POST"])
def ocr():
    data = request.get_json(force=True)
    filepath = data.get("filepath", "")
    if not filepath or not os.path.exists(filepath):
        return jsonify({"error": "File not found"}), 400

    result, _ = engine(filepath)
    lines = []
    if result:
        for bbox, text, conf in result:
            xs = [p[0] for p in bbox]
            ys = [p[1] for p in bbox]
            lines.append({
                "text": text,
                "confidence": float(conf),
                "bbox": {
                    "x0": int(min(xs)),
                    "y0": int(min(ys)),
                    "x1": int(max(xs)),
                    "y1": int(max(ys)),
                },
            })
    full_text = "".join(l["text"] for l in lines)
    return jsonify({"text": full_text, "lines": lines})


if __name__ == "__main__":
    print("OCR service ready on port 3002")
    app.run(host="127.0.0.1", port=3002)
