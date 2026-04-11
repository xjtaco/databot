package com.databot.bridge.handler;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import java.math.BigDecimal;
import java.sql.Date;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Time;
import java.sql.Timestamp;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class QueryHandlerTest {

  private QueryHandler handler;
  private ResultSet mockRs;

  @BeforeEach
  void setUp() {
    handler = new QueryHandler(null); // poolManager not needed for convertValue tests
    mockRs = mock(ResultSet.class);
  }

  @Test
  void convertValueShouldReturnNullForNull() throws SQLException {
    when(mockRs.getObject(1)).thenReturn(null);
    assertNull(handler.convertValue(mockRs, 1));
  }

  @Test
  void convertValueShouldConvertBigDecimalToDouble() throws SQLException {
    when(mockRs.getObject(1)).thenReturn(new BigDecimal("123.456"));
    Object result = handler.convertValue(mockRs, 1);
    assertEquals(123.456, result);
  }

  @Test
  void convertValueShouldConvertTimestampToString() throws SQLException {
    Timestamp ts = Timestamp.valueOf("2024-01-15 10:30:00");
    when(mockRs.getObject(1)).thenReturn(ts);
    Object result = handler.convertValue(mockRs, 1);
    assertInstanceOf(String.class, result);
    assertTrue(((String) result).contains("2024-01-15"));
  }

  @Test
  void convertValueShouldConvertDateToString() throws SQLException {
    Date date = Date.valueOf("2024-01-15");
    when(mockRs.getObject(1)).thenReturn(date);
    Object result = handler.convertValue(mockRs, 1);
    assertEquals("2024-01-15", result);
  }

  @Test
  void convertValueShouldConvertTimeToString() throws SQLException {
    Time time = Time.valueOf("10:30:00");
    when(mockRs.getObject(1)).thenReturn(time);
    Object result = handler.convertValue(mockRs, 1);
    assertEquals("10:30:00", result);
  }

  @Test
  void convertValueShouldHandleBinaryAsPlaceholder() throws SQLException {
    when(mockRs.getObject(1)).thenReturn(new byte[] {1, 2, 3});
    Object result = handler.convertValue(mockRs, 1);
    assertEquals("[binary]", result);
  }

  @Test
  void convertValueShouldPassThroughStrings() throws SQLException {
    when(mockRs.getObject(1)).thenReturn("hello");
    Object result = handler.convertValue(mockRs, 1);
    assertEquals("hello", result);
  }

  @Test
  void convertValueShouldPassThroughIntegers() throws SQLException {
    when(mockRs.getObject(1)).thenReturn(42);
    Object result = handler.convertValue(mockRs, 1);
    assertEquals(42, result);
  }

  @Test
  void convertValueShouldPassThroughLongs() throws SQLException {
    when(mockRs.getObject(1)).thenReturn(9999999999L);
    Object result = handler.convertValue(mockRs, 1);
    assertEquals(9999999999L, result);
  }

  @Test
  void convertValueShouldPassThroughBooleans() throws SQLException {
    when(mockRs.getObject(1)).thenReturn(true);
    Object result = handler.convertValue(mockRs, 1);
    assertEquals(true, result);
  }
}
