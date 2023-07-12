# Must be run as administrator
import winreg
import ctypes
import sys

try:
  # try to elevate privileges
  if ctypes.windll.shell32.IsUserAnAdmin() != 0:
    pass
  else:
    print("Not running as administrator. Trying to elevate...")
    ctypes.windll.shell32.ShellExecuteW(None, "runas", sys.executable, __file__, None, 1)
    sys.exit(0)
except:
  print("Not running as administrator. Please run as administrator.")
  sys.exit(-1)

# connect
reg = winreg.ConnectRegistry(None, winreg.HKEY_LOCAL_MACHINE)

key = winreg.OpenKeyEx(reg, r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall", 0, winreg.KEY_ENUMERATE_SUB_KEYS)

i = 0
while True:
  try:
    x = winreg.EnumKey(key, i)

    if x.startswith("Raspberry Pi Pico SDK"):
      try:
        xkey = winreg.OpenKeyEx(key, x, 0, winreg.KEY_QUERY_VALUE)
        val = winreg.QueryValueEx(xkey, "InstallPath")

        if val[1] == winreg.REG_SZ:
          dest_key = winreg.OpenKeyEx(reg, r"SOFTWARE\WOW6432Node", 0, winreg.KEY_CREATE_SUB_KEY)
          company_key = winreg.CreateKeyEx(dest_key, r"Raspberry Pi", 0, winreg.KEY_CREATE_SUB_KEY)
          sdk_key = winreg.CreateKeyEx(company_key, f"Pico SDK {x.split(' ')[-1]}", 0, winreg.KEY_SET_VALUE)

          winreg.SetValueEx(sdk_key, "InstallPath", 0, winreg.REG_SZ, val[0])

          sdk_key.Close()
          company_key.Close()
          dest_key.Close()
        xkey.Close()
      except Exception as e:
        print(e)
        pass

    i += 1
  except Exception as e:
    print("Final exception")
    print(e)
    # no more sub-keys to enum
    break

key.Close()
reg.Close()
