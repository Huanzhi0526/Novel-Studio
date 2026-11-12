param(
  [Parameter(Mandatory)][string] $Executable,
  [Parameter(Mandatory)][string] $Icon
)

$ErrorActionPreference = 'Stop'

Add-Type -TypeDefinition @'
using System;
using System.ComponentModel;
using System.IO;
using System.Runtime.InteropServices;

public static class NovelStudioIcon
{
    // Electron uses this resource for the executable icon selected by Explorer.
    private static readonly IntPtr GroupType = new IntPtr(14);
    private static readonly IntPtr ImageType = new IntPtr(3);
    private static readonly IntPtr MainGroup = new IntPtr(1);
    private const ushort Language = 1033;
    private const ushort FirstImageId = 501;

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern IntPtr LoadLibraryEx(string path, IntPtr file, uint flags);

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern IntPtr FindResourceEx(IntPtr module, IntPtr type, IntPtr name, ushort language);

    [DllImport("kernel32.dll")]
    private static extern bool FreeLibrary(IntPtr module);

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern IntPtr BeginUpdateResource(string path, bool deleteExisting);

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern bool UpdateResource(IntPtr update, IntPtr type, IntPtr name,
        ushort language, byte[] data, uint length);

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern bool EndUpdateResource(IntPtr update, bool discard);

    public static void Set(string executable, string iconPath)
    {
        byte[] icon = File.ReadAllBytes(iconPath);
        if (icon.Length < 6 || BitConverter.ToUInt16(icon, 0) != 0 || BitConverter.ToUInt16(icon, 2) != 1)
            throw new InvalidDataException("Expected an ICO file.");

        int count = BitConverter.ToUInt16(icon, 4);
        if (count < 1 || count > 32 || icon.Length < 6 + count * 16)
            throw new InvalidDataException("Invalid ICO frame table.");

        IntPtr module = LoadLibraryEx(executable, IntPtr.Zero, 0x02);
        if (module == IntPtr.Zero) throw new Win32Exception();
        try
        {
            if (FindResourceEx(module, GroupType, MainGroup, Language) == IntPtr.Zero)
                throw new InvalidOperationException("The Electron executable icon resource has changed.");
            for (int i = 0; i < count; i++)
                if (FindResourceEx(module, ImageType, new IntPtr(FirstImageId + i), Language) != IntPtr.Zero)
                    throw new InvalidOperationException("The Electron executable already uses a reserved icon resource ID.");
        }
        finally { FreeLibrary(module); }

        IntPtr update = BeginUpdateResource(executable, false);
        if (update == IntPtr.Zero) throw new Win32Exception();
        try
        {
            // The PE icon group uses a resource ID in place of each ICO frame offset.
            byte[] group = new byte[6 + count * 14];
            Buffer.BlockCopy(icon, 0, group, 0, 6);
            for (int i = 0; i < count; i++)
            {
                int entry = 6 + i * 16;
                int length = BitConverter.ToInt32(icon, entry + 8);
                int offset = BitConverter.ToInt32(icon, entry + 12);
                if (length <= 0 || offset < 6 + count * 16 || offset > icon.Length - length)
                    throw new InvalidDataException("Invalid ICO frame data.");

                ushort id = (ushort)(FirstImageId + i);
                byte[] image = new byte[length];
                Buffer.BlockCopy(icon, offset, image, 0, length);
                if (!UpdateResource(update, ImageType, new IntPtr(id), Language, image, (uint)length))
                    throw new Win32Exception();
                int groupEntry = 6 + i * 14;
                Buffer.BlockCopy(icon, entry, group, groupEntry, 12);
                Buffer.BlockCopy(BitConverter.GetBytes(id), 0, group, groupEntry + 12, 2);
            }
            if (!UpdateResource(update, GroupType, MainGroup, Language, group, (uint)group.Length))
                throw new Win32Exception();
        }
        catch
        {
            EndUpdateResource(update, true);
            throw;
        }
        if (!EndUpdateResource(update, false)) throw new Win32Exception();
    }
}
'@

[NovelStudioIcon]::Set((Resolve-Path -LiteralPath $Executable).Path, (Resolve-Path -LiteralPath $Icon).Path)
