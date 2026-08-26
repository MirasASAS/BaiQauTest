-- Создаём функцию для автоматического назначения первого пользователя админом
CREATE OR REPLACE FUNCTION make_first_user_admin()
RETURNS TRIGGER AS $$
BEGIN
  -- Проверяем, есть ли уже пользователи
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE role = 'admin') THEN
    -- Если админов нет, делаем этого пользователя админом
    NEW.role := 'admin';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Создаём триггер перед вставкой в profiles
DROP TRIGGER IF EXISTS make_first_user_admin_trigger ON profiles;
CREATE TRIGGER make_first_user_admin_trigger
  BEFORE INSERT ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION make_first_user_admin();