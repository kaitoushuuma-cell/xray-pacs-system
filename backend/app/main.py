from fastapi import FastAPI, File, UploadFile, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from datetime import datetime
from dotenv import load_dotenv
import cv2
import numpy as np
import joblib
import shutil
import uuid
import os

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), '..', '.env'))

from database import init_db, get_db, Patient, Study, Image, Report

app = FastAPI()

# CORS設定
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# モデル読み込み
model = joblib.load("xray_model.pkl")

# DB初期化
init_db()

# ────────────────────────────
# 患者管理
# ────────────────────────────

# 患者登録
@app.post("/patients")
def create_patient(
    patient_id: str,
    name: str,
    birth_date: str,
    gender: str,
    db: Session = Depends(get_db)
):
    # 重複チェック
    existing = db.query(Patient).filter(Patient.patient_id == patient_id).first()
    if existing:
        raise HTTPException(status_code=400, detail="この患者IDは既に登録されています")
    
    patient = Patient(
        patient_id=patient_id,
        name=name,
        birth_date=birth_date,
        gender=gender
    )
    db.add(patient)
    db.commit()
    db.refresh(patient)
    return {"message": "患者登録完了", "patient_id": patient.patient_id}

# 患者一覧取得
@app.get("/patients")
def get_patients(db: Session = Depends(get_db)):
    patients = db.query(Patient).all()
    return [
        {
            "id": p.id,
            "patient_id": p.patient_id,
            "name": p.name,
            "birth_date": p.birth_date,
            "gender": p.gender,
            "created_at": p.created_at
        }
        for p in patients
    ]

# 患者詳細取得（過去検査履歴含む）
@app.get("/patients/{patient_id}")
def get_patient(patient_id: str, db: Session = Depends(get_db)):
    patient = db.query(Patient).filter(Patient.patient_id == patient_id).first()
    if not patient:
        raise HTTPException(status_code=404, detail="患者が見つかりません")
    return {
        "id": patient.id,
        "patient_id": patient.patient_id,
        "name": patient.name,
        "birth_date": patient.birth_date,
        "gender": patient.gender,
        "studies": [
            {
                "study_id": s.study_id,
                "patient_name": patient.name,
                "modality": s.modality,
                "body_part": s.body_part,
                "study_date": str(s.study_date)[:10] if s.study_date else "",
                "status": s.status,
                "jpeg_file": next((img.file_path.split("/")[-1] for img in reversed(s.images) if img.file_path), None),
                "ai_result": next((img.ai_result for img in reversed(s.images) if img.ai_result), None),
                "ai_confidence": next((f"{img.ai_confidence*100:.1f}%" for img in reversed(s.images) if img.ai_confidence), None)
            }
            for s in patient.studies
        ]
    }

# ────────────────────────────
# 検査管理
# ────────────────────────────

# 検査登録
@app.post("/studies")
def create_study(
    patient_id: str,
    modality: str,
    body_part: str,
    db: Session = Depends(get_db)
):
    patient = db.query(Patient).filter(Patient.patient_id == patient_id).first()
    if not patient:
        raise HTTPException(status_code=404, detail="患者が見つかりません")
    
    study = Study(
        study_id=str(uuid.uuid4()),
        patient_id=patient.id,
        modality=modality,
        body_part=body_part,
        status="未読"
    )
    db.add(study)
    db.commit()
    db.refresh(study)
    return {"message": "検査登録完了", "study_id": study.study_id}

# 検査一覧取得
@app.get("/studies")
def get_studies(db: Session = Depends(get_db)):
    studies = db.query(Study).all()
    return [
        {
            "study_id": s.study_id,
            "modality": s.modality,
            "body_part": s.body_part,
            "study_date": s.study_date,
            "status": s.status,
            "patient_name": s.patient.name,
            "jpeg_file": next((img.file_path.split("/")[-1] for img in reversed(s.images) if img.file_path), None),
            "ai_result": next((img.ai_result for img in reversed(s.images) if img.ai_result), None),
            "ai_confidence": next((f"{img.ai_confidence*100:.1f}%" for img in reversed(s.images) if img.ai_confidence), None),
        }
        for s in studies
    ]

# 検査ステータス更新
@app.patch("/studies/{study_id}/status")
def update_study_status(study_id: str, status: str, db: Session = Depends(get_db)):
    study = db.query(Study).filter(Study.study_id == study_id).first()
    if not study:
        raise HTTPException(status_code=404, detail="検査が見つかりません")
    study.status = status
    db.commit()
    return {"message": "ステータス更新完了", "study_id": study_id, "status": status}

# ────────────────────────────
# AI診断（既存機能を拡張）
# ────────────────────────────

@app.post("/predict")
async def predict(
    study_id: str,
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    # 検査確認
    study = db.query(Study).filter(Study.study_id == study_id).first()
    if not study:
        raise HTTPException(status_code=404, detail="検査が見つかりません")

    # 画像保存
    image_filename = f"{uuid.uuid4()}.png"
    image_path = f"../data/images/{image_filename}"
    with open(image_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    # AI診断
    contents = open(image_path, "rb").read()
    nparr = np.frombuffer(contents, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_GRAYSCALE)
    img_resized = cv2.resize(img, (64, 64))
    img_flat = img_resized.flatten().reshape(1, -1)

    pred = model.predict(img_flat)[0]
    prob = model.predict_proba(img_flat)[0]
    result = "肺炎" if pred == 1 else "正常"
    confidence = float(max(prob))

    # DB保存
    image_record = Image(
        study_id=study.id,
        file_path=image_path,
        ai_result=result,
        ai_confidence=confidence
    )
    db.add(image_record)

    # 検査ステータス更新
    study.status = "AI診断済"
    db.commit()

    return {
        "result": result,
        "confidence": f"{confidence*100:.1f}%",
        "study_id": study_id
    }

# ────────────────────────────
# レポート管理
# ────────────────────────────

@app.post("/reports")
def create_report(
    study_id: str,
    patient_name: str,
    modality: str,
    study_date: str,
    ai_result: str,
    ai_confidence: str,
    findings: str,
    conclusion: str,
    radiologist: str,
    db: Session = Depends(get_db)
):
    report = Report(
        study_id=study_id,
        patient_name=patient_name,
        modality=modality,
        study_date=study_date,
        ai_result=ai_result,
        ai_confidence=ai_confidence,
        findings=findings,
        conclusion=conclusion,
        radiologist=radiologist,
        created_at=datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    )
    db.add(report)
    db.commit()
    db.refresh(report)
    return {"message": "レポート作成完了", "report_id": report.id}

@app.get("/reports")
def get_reports(db: Session = Depends(get_db)):
    reports = db.query(Report).all()
    return [
        {
            "id": r.id,
            "study_id": r.study_id,
            "patient_name": r.patient_name,
            "modality": r.modality,
            "study_date": r.study_date,
            "ai_result": r.ai_result,
            "ai_confidence": r.ai_confidence,
            "findings": r.findings,
            "conclusion": r.conclusion,
            "radiologist": r.radiologist,
            "created_at": r.created_at
        }
        for r in reports
    ]

@app.get("/reports/{report_id}")
def get_report(report_id: int, db: Session = Depends(get_db)):
    report = db.query(Report).filter(Report.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="レポートが見つかりません")
    return report

# ────────────────────────────
# AI 所見・結論 自動生成
# ────────────────────────────

def _build_report_text(ai_result: str, ai_confidence: str, modality: str, body_part: str, study_date: str):
    modality = modality or "X線"
    body_part = body_part if body_part and body_part != "不明" else "胸部"
    date_str = study_date or datetime.now().strftime("%Y-%m-%d")

    if ai_result == "肺炎":
        findings = (
            f"{date_str}撮影の{modality}画像において、{body_part}に浸潤影を認めます。"
            f"右下肺野を中心に境界不明瞭な淡い陰影が見られ、気管支血管束の不明瞭化を伴います。"
            f"エアブロンコグラムを一部に認め、左肺野にも軽微な透過性低下があります。"
            f"縦隔の偏位は認めず、胸水貯留は軽度です。"
        )
        conclusion = (
            f"上記所見より、細菌性肺炎が疑われます（AI確信度：{ai_confidence}）。"
            f"臨床症状・血液検査所見と合わせてご判断のうえ、適切な抗菌薬治療をご検討ください。"
            f"治療効果の確認のため、1〜2週間後のフォローアップ撮影を推奨します。"
        )
    else:
        findings = (
            f"{date_str}撮影の{modality}画像において、{body_part}両肺野は清明で、"
            f"浸潤影・結節影・腫瘤影は認めません。"
            f"肺門リンパ節の腫大および胸水貯留も認めません。"
            f"心陰影の拡大なく、横隔膜・肋骨横隔膜角は正常範囲内です。"
        )
        conclusion = (
            f"明らかな異常所見は認めません（AI確信度：{ai_confidence}）。"
            f"定期的なフォローアップをお勧めします。"
            f"臨床症状が持続する場合は、CT等の追加検査をご検討ください。"
        )

    return {"findings": findings, "conclusion": conclusion}


@app.post("/generate-report-text")
def generate_report_text(study_id: str, db: Session = Depends(get_db)):
    study = db.query(Study).filter(Study.study_id == study_id).first()
    if not study:
        raise HTTPException(status_code=404, detail="検査が見つかりません")

    image = next((img for img in reversed(study.images) if img.ai_result), None)
    ai_result = image.ai_result if image else "正常"
    ai_confidence = f"{image.ai_confidence*100:.1f}%" if image and image.ai_confidence else "不明"
    study_date_str = str(study.study_date)[:10] if study.study_date else ""

    return _build_report_text(ai_result, ai_confidence, study.modality, study.body_part, study_date_str)

# 動作確認用
@app.get("/")
def root():
    return {"message": "xray-pacs-system API 起動中"}

# ────────────────────────────
# 一般画像アップロード（PNG/JPEG → 検査自動作成）
# ────────────────────────────

@app.post("/simple-upload")
async def simple_upload(
    patient_id: str,
    modality: str = "CR",
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    patient = db.query(Patient).filter(Patient.patient_id == patient_id).first()
    if not patient:
        raise HTTPException(status_code=404, detail="患者が見つかりません")

    image_filename = f"{uuid.uuid4()}.jpg"
    image_path = f"/root/xray-pacs-system/data/images/{image_filename}"

    contents = await file.read()
    nparr = np.frombuffer(contents, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if img is None:
        raise HTTPException(status_code=400, detail="画像の読み込みに失敗しました")
    cv2.imwrite(image_path, img)

    study = Study(
        study_id=str(uuid.uuid4()),
        patient_id=patient.id,
        modality=modality,
        body_part="胸部" if modality == "CR" else "不明",
        study_date=datetime.now(),
        status="未読"
    )
    db.add(study)
    db.commit()
    db.refresh(study)

    image_record = Image(
        study_id=study.id,
        file_path=image_path,
        ai_result=None,
        ai_confidence=None
    )
    db.add(image_record)
    db.commit()

    return {"message": "アップロード完了", "study_id": study.study_id, "modality": modality, "jpeg_file": image_filename}

# ────────────────────────────
# 患者削除
# ────────────────────────────

@app.delete("/patients/{patient_id}")
def delete_patient(patient_id: str, db: Session = Depends(get_db)):
    patient = db.query(Patient).filter(Patient.patient_id == patient_id).first()
    if not patient:
        raise HTTPException(status_code=404, detail="患者が見つかりません")
    for study in patient.studies:
        for image in study.images:
            db.delete(image)
        db.delete(study)
    db.delete(patient)
    db.commit()
    return {"message": "削除しました"}

# ────────────────────────────
# レポート削除
# ────────────────────────────

@app.delete("/reports/{report_id}")
def delete_report(report_id: int, db: Session = Depends(get_db)):
    report = db.query(Report).filter(Report.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="レポートが見つかりません")
    db.delete(report)
    db.commit()
    return {"message": "削除しました"}

# ────────────────────────────
# 登録済み画像でAI診断
# ────────────────────────────

@app.post("/studies/{study_id}/predict-registered")
def predict_from_registered(study_id: str, db: Session = Depends(get_db)):
    study = db.query(Study).filter(Study.study_id == study_id).first()
    if not study:
        raise HTTPException(status_code=404, detail="検査が見つかりません")

    image = next((img for img in reversed(study.images) if img.file_path), None)
    if not image:
        raise HTTPException(status_code=404, detail="この検査には画像がありません")

    img_data = cv2.imread(image.file_path, cv2.IMREAD_GRAYSCALE)
    if img_data is None:
        raise HTTPException(status_code=500, detail="画像の読み込みに失敗しました")

    img_resized = cv2.resize(img_data, (64, 64))
    img_flat = img_resized.flatten().reshape(1, -1)

    pred = model.predict(img_flat)[0]
    prob = model.predict_proba(img_flat)[0]
    result = "肺炎" if pred == 1 else "正常"
    confidence = float(max(prob))

    image.ai_result = result
    image.ai_confidence = confidence
    study.status = "AI診断済"
    db.commit()

    return {"result": result, "confidence": f"{confidence*100:.1f}%", "study_id": study_id}

# ────────────────────────────
# 検査への画像追加
# ────────────────────────────

@app.post("/studies/{study_id}/images")
async def add_image_to_study(study_id: str, file: UploadFile = File(...), db: Session = Depends(get_db)):
    study = db.query(Study).filter(Study.study_id == study_id).first()
    if not study:
        raise HTTPException(status_code=404, detail="検査が見つかりません")

    image_filename = f"{uuid.uuid4()}.jpg"
    image_path = f"/root/xray-pacs-system/data/images/{image_filename}"

    contents = await file.read()
    nparr = np.frombuffer(contents, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if img is None:
        raise HTTPException(status_code=400, detail="画像の読み込みに失敗しました")
    cv2.imwrite(image_path, img)

    image_record = Image(
        study_id=study.id,
        file_path=image_path,
        ai_result=None,
        ai_confidence=None
    )
    db.add(image_record)
    db.commit()

    return {"message": "画像を追加しました", "jpeg_file": image_filename}

# ────────────────────────────
# DICOM対応
# ────────────────────────────

@app.post("/dicom/upload")
async def upload_dicom(
    patient_id: str,
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    import pydicom
    import io
    from PIL import Image as PILImage

    # 患者確認
    patient = db.query(Patient).filter(Patient.patient_id == patient_id).first()
    if not patient:
        raise HTTPException(status_code=404, detail="患者が見つかりません")

    # DICOMファイルを読み込む
    contents = await file.read()
    ds = pydicom.dcmread(io.BytesIO(contents), force=True)

    # ヘッダ情報を取得
    modality = str(ds.get("Modality", "不明"))
    raw_date = ds.get("StudyDate", None)
    if raw_date and str(raw_date) != "":
        try:
            study_date = datetime.strptime(str(raw_date), "%Y%m%d")
        except:
            study_date = datetime.now()
    else:
        study_date = datetime.now()

    rows = int(ds.get("Rows", 0))
    cols = int(ds.get("Columns", 0))
    print(f"DEBUG: rows={rows}, cols={cols}, hasPixelData={hasattr(ds, 'PixelData')}")

    # ピクセルデータをJPEGに変換して保存
    jpeg_filename = None
    if hasattr(ds, 'PixelData') and rows > 0 and cols > 0:
        pixel_array = ds.pixel_array
        # 16bit → 8bitに変換
        pixel_array = pixel_array.astype(float)
        pixel_array = (pixel_array - pixel_array.min()) / (pixel_array.max() - pixel_array.min()) * 255
        pixel_array = pixel_array.astype(np.uint8)

        # JPEG保存
        jpeg_filename = f"{uuid.uuid4()}.jpg"
        jpeg_path = f"/root/xray-pacs-system/data/images/{jpeg_filename}"
        img = PILImage.fromarray(pixel_array)
        img.save(jpeg_path)

# 検査をDBに登録（先にstudyを保存してidを取得）
    study = Study(
        study_id=str(uuid.uuid4()),
        patient_id=patient.id,
        modality=modality,
        body_part="不明",
        study_date=study_date,
        status="未読"
    )
    db.add(study)
    db.commit()
    db.refresh(study)  # ← ここでstudy.idが確定する

    # 画像レコードをDBに保存
    if jpeg_filename:
        image_record = Image(
            study_id=study.id,  # ← 確定したidを使う
            file_path=f"/root/xray-pacs-system/data/images/{jpeg_filename}",
            ai_result=None,
            ai_confidence=None
        )
        db.add(image_record)
        db.commit()
    db.refresh(study)

    return {
        "message": "DICOMアップロード完了",
        "study_id": study.study_id,
        "modality": modality,
        "study_date": study_date.strftime("%Y-%m-%d"),
        "image_size": f"{rows} x {cols}",
        "jpeg_file": jpeg_filename
    }

    # ────────────────────────────
# 画像配信
# ────────────────────────────
from fastapi.responses import FileResponse

@app.get("/images/{filename}")
def get_image(filename: str):
    image_path = f"/root/xray-pacs-system/data/images/{filename}"
    if not os.path.exists(image_path):
        raise HTTPException(status_code=404, detail="画像が見つかりません")
    return FileResponse(image_path, media_type="image/jpeg")