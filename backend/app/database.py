from sqlalchemy import create_engine, Column, Integer, String, DateTime, Float, ForeignKey
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, relationship
from datetime import datetime

# SQLiteのDB作成
SQLALCHEMY_DATABASE_URL = "sqlite:///./xray_pacs.db"
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# 患者テーブル
class Patient(Base):
    __tablename__ = "patients"
    id          = Column(Integer, primary_key=True, index=True)
    patient_id  = Column(String, unique=True, index=True)  # 患者ID
    name        = Column(String)                            # 氏名
    birth_date  = Column(String)                            # 生年月日
    gender      = Column(String)                            # 性別
    created_at  = Column(DateTime, default=datetime.now)
    studies     = relationship("Study", back_populates="patient")
    cancer_flag = Column(Integer, default=0)  # 0: がんなし, 1: がんあり
    studies     = relationship("Study", back_populates="patient")
    cancer_flag = Column(Integer, default=0)  # 0: がんなし, 1: がんあり
    remission_mode = Column(Integer, default=0)  # 0: 通常, 1: 寛解後

# 検査テーブル
class Study(Base):
    __tablename__ = "studies"
    id          = Column(Integer, primary_key=True, index=True)
    study_id    = Column(String, unique=True, index=True)   # 検査ID
    patient_id  = Column(Integer, ForeignKey("patients.id"))
    modality    = Column(String)                            # CT・MRI・CR等
    body_part   = Column(String)                            # 撮影部位
    study_date  = Column(DateTime, default=datetime.now)
    status      = Column(String, default="未読")            # 未読・既読・レポート済
    patient     = relationship("Patient", back_populates="studies")
    images      = relationship("Image", back_populates="study")

# 画像テーブル
class Image(Base):
    __tablename__ = "images"
    id          = Column(Integer, primary_key=True, index=True)
    study_id    = Column(Integer, ForeignKey("studies.id"))
    file_path   = Column(String)                            # 保存パス
    ai_result   = Column(String)                            # AI診断結果
    ai_confidence = Column(Float)                           # 確信度
    created_at  = Column(DateTime, default=datetime.now)
    study       = relationship("Study", back_populates="images")

# レポートテーブル
class Report(Base):
    __tablename__ = "reports"
    id             = Column(Integer, primary_key=True, autoincrement=True)
    study_id       = Column(String, ForeignKey("studies.study_id"))
    patient_name   = Column(String)
    modality       = Column(String)
    study_date     = Column(String)
    ai_result      = Column(String)
    ai_confidence  = Column(String)
    findings       = Column(String)
    conclusion     = Column(String)
    radiologist    = Column(String)
    created_at     = Column(String)

# 生活習慣テーブル
class LifeLog(Base):
    __tablename__ = "lifelogs"
    id          = Column(Integer, primary_key=True, autoincrement=True)
    patient_id  = Column(String, ForeignKey("patients.patient_id"))
    record_date = Column(String)   # 記録日
    steps       = Column(Integer)  # 歩数
    sleep_hours = Column(Float)    # 睡眠時間
    meal        = Column(String)   # 食事（良い/普通/悪い）
    weight      = Column(Float)    # 体重
    memo        = Column(String)   # メモ
    created_at  = Column(String)

# テーブル作成
def init_db():
    Base.metadata.create_all(bind=engine)

# DBセッション取得
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
