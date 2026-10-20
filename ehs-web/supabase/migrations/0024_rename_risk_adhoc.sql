-- 안전 메뉴 개편 : 수시 위험성평가(JSA) → 위험성평가 › 수시 작업위험성평가 (전자결재함 · 환경설정의 양식 이름)
update public.modules set name = '수시 작업위험성평가' where code = 'risk_adhoc';
